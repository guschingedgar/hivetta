import type { ClaimView, SearchHit } from "@memory/schema";

/**
 * What the reasoner concludes about a newly proposed claim relative to its
 * nearest existing claims. A verdict only ever *adds* information (an edge or
 * an open conflict); it never changes a claim's status. Contradictions are
 * surfaced to a human, never auto-resolved.
 */
export type Verdict =
  | { action: "store" }
  | { action: "merge_into"; targetClaimId: string; reason: string }
  | { action: "flag_conflict"; targetClaimId: string; reason: string };

export interface Reasoner {
  analyseIncoming(claim: ClaimView, neighbours: readonly SearchHit[]): Promise<Verdict>;
}

/** Phase 1: every claim is kept as proposed. Phase 2 replaces this. */
export const noopReasoner: Reasoner = {
  async analyseIncoming() {
    return { action: "store" };
  },
};

export interface AnalysisDeps {
  loadClaim(projectId: string, claimId: string): Promise<ClaimView | null>;
  neighbours(projectId: string, claimId: string, k: number): Promise<SearchHit[]>;
  reasoner: Reasoner;
}

/**
 * The claim.analyse job: load the claim, find its neighbours in the same
 * project, ask the reasoner. Runs asynchronously in apps/worker, after the
 * claim is already stored and searchable.
 *
 * Phase 2 applies non-"store" verdicts here: merge_into records a
 * `duplicates` edge (created_by 'reasoner'); flag_conflict opens a row in
 * `conflicts` for a human to resolve.
 */
export async function analyseClaim(
  deps: AnalysisDeps,
  job: { projectId: string; claimId: string },
): Promise<Verdict | null> {
  const claim = await deps.loadClaim(job.projectId, job.claimId);
  if (!claim) return null; // nothing to analyse; never retry a missing claim
  const neighbours = await deps.neighbours(job.projectId, job.claimId, 10);
  return deps.reasoner.analyseIncoming(claim, neighbours);
}
