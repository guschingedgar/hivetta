import { EmbeddingUnavailableError, type Embedder } from "@memory/embeddings";
import { BranchName, HandoffFields, Provenance, type ClaimView, type HandoffView, type ProposedClaim } from "@memory/schema";
import { StoreError, type NewClaim, type UserStore } from "@memory/store";
import { validateBatch, type Rejection } from "./validate";

/** The authenticated caller, as established by the surface's auth layer. */
export interface Principal {
  userId: string;
  /** Human-readable identity snapshot stored as provenance (e.g. email). */
  label: string;
  /** OAuth client that presented the token, when there is one. */
  clientId: string | null;
}

/** The internal format every adapter normalises into. */
export interface IngestRequest {
  projectId: string;
  principal: Principal;
  /** Model that produced the claims, as reported by the caller. */
  model: string;
  /** Which client or surface the write came through, e.g. "claude-ai". */
  client: string;
  /** Untrusted: validated per item here. */
  claims: readonly unknown[];
  /** The request exactly as received, stored with the source. */
  rawPayload: unknown;
  /** Save as drafts in this branch (created if new) instead of main memory. */
  branch?: { name: string; gitBranch?: string };
}

export interface IngestResult {
  stored: ClaimView[];
  rejected: Rejection[];
  /** The branch the claims were saved to, when they are drafts. */
  branch?: string;
}

export interface IngestDeps {
  store: Pick<UserStore, "ingest">;
  embedder: Embedder;
}

export type IngestErrorCode = "provenance" | "embedding_unavailable" | "forbidden" | "invalid" | "unavailable";

/** A failure of the whole call (as opposed to a per-claim rejection). */
export class IngestError extends Error {
  constructor(
    readonly code: IngestErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "IngestError";
  }
}

/**
 * Validate, attach provenance, embed and store proposed claims.
 *
 * Partial success: invalid claims are returned in `rejected` with reasons and
 * the rest are stored. Whole-call failures (no usable provenance, embedding
 * service down, not permitted) throw IngestError and store nothing.
 *
 * Analysis of what was stored (duplicates, conflicts) is not done here: the
 * database calls the check-claim Edge Function for every new claim.
 */
export async function ingestClaims(deps: IngestDeps, req: IngestRequest): Promise<IngestResult> {
  const provenance = buildProvenance(req);
  const branch = req.branch ? parseBranch(req.branch.name) : undefined;
  const gitBranch = req.branch?.gitBranch?.trim().slice(0, 200) || undefined;

  const { accepted, rejected } = validateBatch(req.claims);
  if (accepted.length === 0) return { stored: [], rejected };

  const newClaims = await embedClaims(deps.embedder, accepted.map((a) => a.claim));

  try {
    const stored = await deps.store.ingest(
      { projectId: req.projectId, provenance, rawPayload: req.rawPayload },
      newClaims,
      branch ? { branch, gitBranch } : {},
    );
    return { stored, rejected, ...(branch ? { branch } : {}) };
  } catch (err) {
    throw toIngestError(err);
  }
}

// ---- handoffs ---------------------------------------------------------

export interface HandoffRequest {
  projectId: string;
  principal: Principal;
  model: string;
  client: string;
  /** Untrusted: title, area, recipient, summary, next_steps, links. Validated as a whole. */
  handoff: unknown;
  /** Untrusted: validated per item, exactly like propose_claims. */
  claims: readonly unknown[];
  rawPayload: unknown;
}

export interface HandoffResult {
  handoff: HandoffView;
  /** Claims left out of the handoff, with reasons. The handoff itself was still stored. */
  rejected: Rejection[];
}

export interface HandoffDeps {
  store: Pick<UserStore, "createHandoff">;
  embedder: Embedder;
}

/**
 * Store a handoff and the claims recorded with it, in one transaction.
 *
 * The handoff fields must all be valid, or nothing is stored. Claims are
 * validated per item: invalid ones are reported in `rejected` and left out,
 * the rest are saved as ordinary proposed claims (and checked like any claim).
 */
export async function createHandoff(deps: HandoffDeps, req: HandoffRequest): Promise<HandoffResult> {
  const provenance = buildProvenance(req);

  const fields = HandoffFields.safeParse(req.handoff);
  if (!fields.success) {
    const problems = fields.error.issues.map((i) => `${i.path.join(".") || "handoff"}: ${i.message}`).join("; ");
    throw new IngestError("invalid", `The handoff was not stored. Fix these fields and retry: ${problems}`, false);
  }

  const { accepted, rejected } = validateBatch(req.claims);
  const newClaims = await embedClaims(deps.embedder, accepted.map((a) => a.claim));

  try {
    const handoff = await deps.store.createHandoff(
      { projectId: req.projectId, provenance, rawPayload: req.rawPayload },
      fields.data,
      newClaims,
    );
    return { handoff, rejected };
  } catch (err) {
    throw toIngestError(err);
  }
}

// ---- shared steps -----------------------------------------------------

/** A branch name the database will accept, or a whole-call error the model can fix. */
export function parseBranch(name: string): string {
  const parsed = BranchName.safeParse(name);
  if (!parsed.success) {
    throw new IngestError("invalid", `Nothing was stored: ${parsed.error.issues[0]?.message ?? "invalid branch name"}.`, false);
  }
  return parsed.data;
}

/** Invariant 1, application side: no provenance, no write. */
function buildProvenance(req: { principal: Principal; model: string; client: string }): Provenance {
  const provenance = Provenance.safeParse({
    authorId: req.principal.userId,
    authorLabel: req.principal.label,
    model: req.model,
    client: req.client,
    clientId: req.principal.clientId,
  });
  if (!provenance.success) {
    const fields = provenance.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new IngestError("provenance", `Missing or invalid provenance (${fields}); nothing was stored.`, false);
  }
  return provenance.data;
}

async function embedClaims(embedder: Embedder, claims: readonly ProposedClaim[]): Promise<NewClaim[]> {
  if (claims.length === 0) return [];
  let vectors: Array<number[] | null>;
  try {
    vectors = await embedder.embed(claims.map((c) => c.text));
  } catch (err) {
    if (err instanceof EmbeddingUnavailableError) {
      throw new IngestError(
        "embedding_unavailable",
        "The embedding service is unavailable; nothing was stored. Retry shortly.",
        true,
        { cause: err },
      );
    }
    throw err;
  }
  return claims.map((c, i) => ({
    ...c,
    embedding: vectors[i] ?? null,
    embeddingModel: vectors[i] ? embedder.model : null,
  }));
}

function toIngestError(err: unknown): unknown {
  if (!(err instanceof StoreError)) return err;
  const code: IngestErrorCode =
    err.code === "forbidden" || err.code === "not_found"
      ? "forbidden"
      : err.code === "invalid" || err.code === "conflict"
        ? "invalid"
        : "unavailable";
  const message =
    code === "forbidden"
      ? "You do not have contributor access to this project, or it does not exist."
      : code === "invalid"
        ? `The database rejected the request: ${err.message}`
        : "Storage is temporarily unavailable; nothing was stored. Retry shortly.";
  return new IngestError(code, message, code === "unavailable", { cause: err });
}
