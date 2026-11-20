import type { BranchView, ClaimView, HandoffView, SearchHit } from "@memory/schema";
import type { ProjectBrief } from "@memory/retrieval";

// Wire shapes the calling model reads. Flat, with provenance spelled out, so a
// model can cite who said what and judge how much to trust it.

export function claimForModel(c: ClaimView) {
  return {
    id: c.id,
    type: c.type,
    status: c.status,
    text: c.text,
    saved_by: c.provenance.author,
    model: c.provenance.model,
    client: c.provenance.client,
    saved_at: c.provenance.recordedAt,
    ...(c.rationale ? { why: c.rationale } : {}),
    ...(c.details ? { details: c.details } : {}),
    ...(c.links?.length ? { links: c.links } : {}),
    ...(c.confidence !== null ? { author_confidence: c.confidence } : {}),
    ...(c.supersededBy ? { superseded_by: c.supersededBy } : {}),
  };
}

export function hitForModel(h: SearchHit) {
  return { ...claimForModel(h), relevance: Number(h.score.toFixed(4)), matched_by: h.matchedBy };
}

const BRIEF_SUMMARY_CHARS = 1200;

export function briefForModel(b: ProjectBrief) {
  const omitted = Object.entries(b.omitted).filter(([, n]) => n > 0);
  return {
    project: b.project,
    decisions: b.decisions.map(claimForModel),
    facts: b.facts.map(claimForModel),
    open_questions: b.openQuestions.map(claimForModel),
    working_assumptions: b.assumptions.map(claimForModel),
    // The notes themselves, not just headlines: a client whose tool list
    // predates get_handoffs still gets what it needs to pick the work up.
    recent_handoffs: b.recentHandoffs.map((h) => ({
      id: h.id,
      title: h.title,
      ...(h.area ? { area: h.area } : {}),
      ...(h.recipient ? { for: h.recipient } : {}),
      from: h.provenance.author,
      saved_at: h.createdAt,
      summary: h.summary.length > BRIEF_SUMMARY_CHARS ? `${h.summary.slice(0, BRIEF_SUMMARY_CHARS)}…` : h.summary,
      next_steps: h.nextSteps,
      links: h.links,
    })),
    ...(b.openBranches.length ? { open_branches: b.openBranches.map(branchForModel) } : {}),
    notes: [
      "Decisions, facts and assumptions here are accepted: checked by the AI reviewer against the rest of the memory, or approved by a teammate. Open questions may still be unreviewed.",
      b.pendingReview > 0
        ? `${b.pendingReview} proposed claim(s) await review (for example an open conflict with an accepted claim) and are not shown; search_memory includes them.`
        : null,
      b.recentHandoffs.length
        ? "recent_handoffs are notes teammates left when passing on their work (summary, next steps, links to where the work lives). Use them when the user is picking up or continuing that work; get_handoffs, if available, returns the full notes with their claims."
        : null,
      b.openBranches.length
        ? "open_branches are draft spaces: their claims are not part of the shared memory until merged. Read one with list_branches and its name."
        : null,
      omitted.length
        ? `Omitted for length: ${omitted.map(([k, n]) => `${n} ${k}`).join(", ")}. Use search_memory for more.`
        : null,
    ].filter(Boolean),
  };
}

export function handoffForModel(h: HandoffView) {
  const pending = h.claims.filter((c) => c.status === "proposed").length;
  const setAside = h.claims.filter((c) => c.status === "rejected").length;
  return {
    id: h.id,
    title: h.title,
    ...(h.area ? { area: h.area } : {}),
    ...(h.recipient ? { for: h.recipient } : {}),
    from: h.provenance.author,
    model: h.provenance.model,
    client: h.provenance.client,
    saved_at: h.createdAt,
    summary: h.summary,
    next_steps: h.nextSteps,
    links: h.links,
    claims: h.claims.map(claimForModel),
    ...(pending || setAside
      ? {
          notes: [
            pending
              ? `${pending} claim(s) here are still proposed (not yet confirmed, possibly in conflict with an accepted claim); say so if you rely on them.`
              : null,
            setAside
              ? `${setAside} claim(s) here are marked rejected. That usually means the AI reviewer set them aside as duplicates of claims already in memory, not that they are false; search_memory finds the existing claims.`
              : null,
          ].filter(Boolean),
        }
      : {}),
  };
}

export function branchForModel(b: BranchView) {
  return {
    name: b.name,
    status: b.status,
    ...(b.gitBranch ? { git_branch: b.gitBranch } : {}),
    drafts: b.drafts,
    created_at: b.createdAt,
    ...(b.closedAt ? { closed_at: b.closedAt } : {}),
  };
}
