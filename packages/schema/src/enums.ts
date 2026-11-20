// The one definition of every enumerated value in the system. The SQL CHECK
// constraints in supabase/migrations mirror these; drift.test.ts enforces it.

export const CLAIM_TYPES = ["decision", "fact", "assumption", "open_question"] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const CLAIM_STATUSES = ["proposed", "accepted", "rejected", "superseded", "retired"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** Statuses retrieval returns unless the caller asks otherwise. */
export const LIVE_STATUSES = ["proposed", "accepted"] as const satisfies readonly ClaimStatus[];

export const MEMBER_ROLES = ["viewer", "contributor", "admin"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MESSAGE_ROLES = ["user", "assistant"] as const;

export const EDGE_TYPES = ["supersedes", "duplicates", "contradicts", "supports", "refines"] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const EDGE_CREATORS = ["human", "reasoner"] as const;
export type EdgeCreator = (typeof EDGE_CREATORS)[number];

export const CONFLICT_STATUSES = ["open", "resolved", "dismissed"] as const;
export type ConflictStatus = (typeof CONFLICT_STATUSES)[number];

export const BRANCH_STATUSES = ["open", "merged", "abandoned"] as const;
export type BranchStatus = (typeof BRANCH_STATUSES)[number];

/** Same rule as the CHECK on public.branches.name: git-like, 1-60 characters. */
export const BRANCH_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,59}$/;

export const LIMITS = {
  claimText: { min: 8, max: 2000 },
  claimDetail: { max: 4000 },
  claimsPerCall: 50,
  searchResults: { default: 10, max: 50 },
  label: { max: 100 },
  // Mirrors the CHECK constraints on public.handoffs.
  handoff: {
    title: { min: 3, max: 120 },
    area: { max: 60 },
    recipient: { max: 200 },
    summary: { min: 20, max: 4000 },
    nextSteps: { max: 20 },
    nextStep: { min: 3, max: 300 },
    links: { max: 20 },
    linkLabel: { max: 100 },
    linkUrl: { max: 2000 },
    listDefault: 3,
    listMax: 10,
  },
} as const;
