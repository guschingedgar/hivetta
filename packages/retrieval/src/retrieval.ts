import { EmbeddingUnavailableError, type Embedder } from "@memory/embeddings";
import { BranchName, LIMITS, LIVE_STATUSES, type BranchView, type ClaimView, type HandoffView, type SearchHit } from "@memory/schema";
import { StoreError, type ProjectSummary, type UserStore } from "@memory/store";
import { buildSearchRequest } from "./filters";

export interface RetrievalDeps {
  store: Pick<UserStore, "searchClaims" | "listClaims" | "getProject" | "listProjects" | "listHandoffs" | "listBranches" | "getBranchClaims">;
  embedder: Embedder;
}

export interface SearchMemoryResult {
  hits: SearchHit[];
  /** True when semantic search was unavailable and only keyword matching ran. */
  degraded: boolean;
}

export async function listProjects(deps: Pick<RetrievalDeps, "store">): Promise<ProjectSummary[]> {
  return deps.store.listProjects();
}

/** Hybrid semantic + keyword search, filters applied in SQL before ranking. */
export async function searchMemory(deps: RetrievalDeps, input: unknown): Promise<SearchMemoryResult> {
  const { projectId, params } = buildSearchRequest(input);

  let embedding: number[] | null = null;
  let degraded = false;
  try {
    [embedding = null] = await deps.embedder.embed([params.query]);
    if (!embedding) degraded = true;
  } catch (err) {
    if (!(err instanceof EmbeddingUnavailableError)) throw err;
    degraded = true; // keyword search still works; better than nothing
  }

  const hits = await deps.store.searchClaims(projectId, {
    ...params,
    embedding,
    embeddingModel: embedding ? deps.embedder.model : null,
  });
  return { hits, degraded };
}

export interface ProjectBrief {
  project: { id: string; name: string; workspace: string };
  decisions: ClaimView[];
  facts: ClaimView[];
  assumptions: ClaimView[];
  openQuestions: ClaimView[];
  /** Proposed (not yet accepted) decisions, facts and assumptions awaiting review. */
  pendingReview: number;
  /** The latest handoffs, headline only; get_handoffs returns the full notes. */
  recentHandoffs: HandoffView[];
  /** Open branches: draft spaces not yet merged into the shared memory. */
  openBranches: BranchView[];
  /** Items left out to stay within the budget, per section. */
  omitted: Record<"decisions" | "facts" | "assumptions" | "openQuestions", number>;
}

/** Roughly 2k tokens: enough to orient a new conversation without crowding it. */
const BRIEF_BUDGET_CHARS = 8_000;
const PER_ITEM_OVERHEAD = 80; // provenance line and formatting
const BRIEF_HANDOFFS = 3;

/**
 * A compact orientation for a new conversation: what was decided, what is
 * known, what is still open. Accepted claims only, except open questions,
 * which matter whether or not anyone has reviewed them yet.
 */
export async function getProjectBrief(deps: RetrievalDeps, projectId: string): Promise<ProjectBrief> {
  const [project, accepted, questions, proposed, handoffs, branches] = await Promise.all([
    deps.store.getProject(projectId),
    deps.store.listClaims(projectId, { statuses: ["accepted"], types: ["decision", "fact", "assumption"], limit: 300 }),
    deps.store.listClaims(projectId, { statuses: LIVE_STATUSES, types: ["open_question"], limit: 100 }),
    deps.store.listClaims(projectId, { statuses: ["proposed"], types: ["decision", "fact", "assumption"], limit: 500 }),
    deps.store.listHandoffs(projectId, BRIEF_HANDOFFS),
    deps.store.listBranches(projectId),
  ]);

  // Sections in priority order; each list is newest first from the store.
  const sections = {
    decisions: accepted.filter((c) => c.type === "decision"),
    facts: accepted.filter((c) => c.type === "fact"),
    openQuestions: questions,
    assumptions: accepted.filter((c) => c.type === "assumption"),
  };

  let budget = BRIEF_BUDGET_CHARS;
  const kept = {} as Record<keyof typeof sections, ClaimView[]>;
  const omitted = {} as ProjectBrief["omitted"];
  for (const [name, claims] of Object.entries(sections) as [keyof typeof sections, ClaimView[]][]) {
    kept[name] = [];
    for (const claim of claims) {
      const cost = claim.text.length + PER_ITEM_OVERHEAD;
      if (cost > budget) break;
      budget -= cost;
      kept[name].push(claim);
    }
    omitted[name] = claims.length - kept[name].length;
  }

  return {
    project: { id: project.id, name: project.name, workspace: project.workspaceName },
    ...kept,
    pendingReview: proposed.length,
    recentHandoffs: handoffs,
    openBranches: branches.filter((b) => b.status === "open"),
    omitted,
  };
}

export async function listOpenQuestions(deps: Pick<RetrievalDeps, "store">, projectId: string): Promise<ClaimView[]> {
  await deps.store.getProject(projectId); // a clear not_found instead of an empty list
  return deps.store.listClaims(projectId, { statuses: LIVE_STATUSES, types: ["open_question"], limit: 200 });
}

/** Recent handoffs, newest first, with the current status of the claims recorded with each. */
export async function listHandoffs(
  deps: Pick<RetrievalDeps, "store">,
  projectId: string,
  limit: number = LIMITS.handoff.listDefault,
): Promise<HandoffView[]> {
  await deps.store.getProject(projectId); // a clear not_found instead of an empty list
  return deps.store.listHandoffs(projectId, Math.min(Math.max(limit, 1), LIMITS.handoff.listMax));
}

export async function listBranches(deps: Pick<RetrievalDeps, "store">, projectId: string): Promise<BranchView[]> {
  await deps.store.getProject(projectId); // a clear not_found instead of an empty list
  return deps.store.listBranches(projectId);
}

export interface BranchDetail {
  branch: BranchView;
  drafts: ClaimView[];
}

/** One branch and its drafts. Merged branches have no drafts left: their claims are in main memory. */
export async function getBranch(deps: Pick<RetrievalDeps, "store">, projectId: string, name: string): Promise<BranchDetail> {
  const parsed = BranchName.safeParse(name);
  if (!parsed.success) throw new StoreError("not_found", `no branch named "${name}"`);
  const branches = await listBranches(deps, projectId);
  const branch = branches.find((b) => b.name.toLowerCase() === parsed.data.toLowerCase());
  if (!branch) throw new StoreError("not_found", `no branch named "${parsed.data}"`);
  const drafts = branch.status === "merged" ? [] : await deps.store.getBranchClaims(projectId, { name: branch.name });
  return { branch, drafts };
}
