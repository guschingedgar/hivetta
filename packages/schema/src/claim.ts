import { z } from "zod";
import { BRANCH_STATUSES, CLAIM_STATUSES, CLAIM_TYPES, LIMITS } from "./enums";

// The writing rules, read by the calling model with no other context. Shared
// by the strict and draft shapes below so they cannot drift apart.
const DOCS = {
  text:
    "One self-contained statement that a teammate who never saw this conversation can understand. " +
    "Name things explicitly (the service, library, person or document) instead of 'it' or 'this'. " +
    "One idea per claim: split compound statements. For a decision, include the reason in the same sentence. " +
    `Between ${LIMITS.claimText.min} and ${LIMITS.claimText.max} characters. ` +
    "Example: \"The billing service will use Stripe Checkout rather than a custom form, because PCI scope must stay minimal.\"",
  type:
    `Exactly one of: ${CLAIM_TYPES.join(", ")}. ` +
    "decision: something the team chose to do or not do. " +
    "fact: something verifiably true about the world or the system right now. " +
    "assumption: something believed true but not verified; it should be checked later. " +
    "open_question: something unresolved that someone needs to answer, phrased as a question ending in '?'.",
  why:
    "Recommended for decisions and assumptions. The reasoning behind this claim, as discussed in the conversation: " +
    "the problem it solves, the alternatives that were considered and why they lost, and any constraint that drove the choice. " +
    "A short summary in plain sentences (up to 4000 characters), not a transcript. Never include secrets or personal data.",
  details:
    "Optional. Extra context a teammate would need: numbers, scope, edge cases, who is involved, what is still unknown. " +
    "Plain sentences, up to 4000 characters. Leave it out when the statement says it all.",
  links:
    "Optional. Up to 10 full http(s) URLs mentioned in the conversation that back this claim up (docs, tickets, designs).",
  confidence:
    "Optional. How sure you are that this claim is correct and was actually agreed in the conversation, " +
    "from 0 to 1. Omit it rather than guess.",
} as const;

/** A claim as ingest accepts it. Applied per item, so one bad claim never sinks a batch. */
export const ProposedClaim = z.object({
  text: z.string().trim().min(LIMITS.claimText.min).max(LIMITS.claimText.max).describe(DOCS.text),
  type: z.enum(CLAIM_TYPES).describe(DOCS.type),
  why: z.string().trim().max(LIMITS.claimDetail.max).optional().describe(DOCS.why),
  details: z.string().trim().max(LIMITS.claimDetail.max).optional().describe(DOCS.details),
  links: z.array(z.url({ protocol: /^https?$/ }).max(2000)).max(10).optional().describe(DOCS.links),
  confidence: z.number().min(0).max(1).optional().describe(DOCS.confidence),
});
export type ProposedClaim = z.infer<typeof ProposedClaim>;

/**
 * The same claim as the MCP tool advertises it: identical guidance, loose
 * types. If the tool schema were strict, the SDK would reject a whole batch
 * over one malformed item before ingest could report per-claim reasons.
 */
export const ProposedClaimDraft = z.object({
  text: z.string().describe(DOCS.text),
  type: z.string().describe(DOCS.type),
  why: z.string().optional().describe(DOCS.why),
  details: z.string().optional().describe(DOCS.details),
  links: z.array(z.string()).optional().describe(DOCS.links),
  confidence: z.number().optional().describe(DOCS.confidence),
});
export type ProposedClaimDraft = z.infer<typeof ProposedClaimDraft>;

/**
 * Who and what produced a write. Built by the ingest layer from the verified
 * auth context plus the model name the caller reports. Never trusted from the
 * claim payload itself.
 */
export const Provenance = z.object({
  authorId: z.uuid(),
  authorLabel: z.string().trim().min(1).max(200),
  model: z.string().trim().min(1).max(LIMITS.label.max),
  client: z.string().trim().min(1).max(LIMITS.label.max),
  clientId: z.string().nullable(),
});
export type Provenance = z.infer<typeof Provenance>;

/** A stored claim with its provenance, as every read path returns it. */
export const ClaimView = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  text: z.string(),
  type: z.enum(CLAIM_TYPES),
  status: z.enum(CLAIM_STATUSES),
  confidence: z.number().nullable(),
  createdAt: z.string(),
  supersededBy: z.uuid().nullable(),
  /** Optional context saved with the claim: the reasoning, extra details, supporting links. */
  rationale: z.string().nullable(),
  details: z.string().nullable(),
  links: z.array(z.string()).nullable(),
  /** True when the AI saved it on its own initiative (auto-save), not because someone asked. */
  autoSaved: z.boolean().optional(),
  provenance: z.object({
    sourceId: z.uuid(),
    authorId: z.uuid().nullable(),
    author: z.string(),
    model: z.string(),
    client: z.string(),
    recordedAt: z.string(),
  }),
});
export type ClaimView = z.infer<typeof ClaimView>;

/** A branch of a project. Drafts are claims saved to it while it is open. */
export const BranchView = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  gitBranch: z.string().nullable(),
  status: z.enum(BRANCH_STATUSES),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  drafts: z.number().int(),
});
export type BranchView = z.infer<typeof BranchView>;

export const SearchHit = ClaimView.extend({
  score: z.number(),
  matchedBy: z.enum(["semantic", "keyword", "both"]),
});
export type SearchHit = z.infer<typeof SearchHit>;
