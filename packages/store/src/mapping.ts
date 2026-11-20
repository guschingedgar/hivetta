import type { ClaimStatus, ClaimType, ClaimView, SearchHit } from "@memory/schema";

/** Columns of claim_view. Listing them is the rule: never select embeddings. */
// One literal (not a concatenation) so supabase-js can type the result rows.
export const CLAIM_VIEW_COLUMNS =
  "id, project_id, text, type, status, confidence, created_at, superseded_by, source_id, author_id, author_label, model, client, recorded_at, rationale, details, links, auto_saved" as const;

export interface ClaimViewRow {
  id: string | null;
  project_id: string | null;
  text: string | null;
  type: string | null;
  status: string | null;
  confidence: number | null;
  created_at: string | null;
  superseded_by: string | null;
  source_id: string | null;
  author_id: string | null;
  author_label: string | null;
  model: string | null;
  client: string | null;
  recorded_at: string | null;
  rationale?: string | null;
  details?: string | null;
  links?: string[] | null;
  auto_saved?: boolean | null;
}

// View columns are nullable in generated types only because Postgres cannot
// prove a join's nullability; the underlying columns are NOT NULL.
export function toClaimView(r: ClaimViewRow): ClaimView {
  return {
    id: r.id!,
    projectId: r.project_id!,
    text: r.text!,
    type: r.type as ClaimType,
    status: r.status as ClaimStatus,
    confidence: r.confidence,
    createdAt: r.created_at!,
    supersededBy: r.superseded_by,
    rationale: r.rationale ?? null,
    details: r.details ?? null,
    links: r.links ?? null,
    autoSaved: r.auto_saved ?? false,
    provenance: {
      sourceId: r.source_id!,
      authorId: r.author_id,
      author: r.author_label!,
      model: r.model!,
      client: r.client!,
      recordedAt: r.recorded_at!,
    },
  };
}

export function toSearchHit(r: ClaimViewRow & { score: number; matched_by: string }): SearchHit {
  return { ...toClaimView(r), score: r.score, matchedBy: r.matched_by as SearchHit["matchedBy"] };
}
