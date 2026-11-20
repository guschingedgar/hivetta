import { z } from "zod";
import { ClaimView, ProposedClaimDraft } from "./claim";
import { LIMITS } from "./enums";

// A handoff: one teammate's assistant passes their part of a project to the
// next person. A short state-of-play note plus the claims recorded with it.

const H = LIMITS.handoff;

// Writing guidance, read by the calling model. Shared by the strict and the
// advertised (loose) shapes so they cannot drift apart.
const DOCS = {
  title: `Short name for the part being handed off, ${H.title.min}-${H.title.max} characters. Example: "Payments module".`,
  area:
    `Optional. The area of the project this covers, one or two words (max ${H.area.max} characters), ` +
    `e.g. "payments", "auth", "docs". Lets the next person find handoffs for their area.`,
  recipient:
    "Optional. Who should pick this up: a teammate's name or email, as the user said it. " +
    "Omit it if the handoff is for anyone.",
  summary:
    "Where things stand, for someone who never saw this conversation: what was built or written, what " +
    "works, what does not yet, and anything surprising they must know. Plain sentences, no conversation " +
    `references. ${H.summary.min}-${H.summary.max} characters.`,
  next_steps:
    `Optional. Concrete next actions, most important first, one per item (max ${H.nextSteps.max} items, ` +
    `${H.nextStep.min}-${H.nextStep.max} characters each). Example: "Wire the checkout.session.completed webhook".`,
  links:
    `Optional. Where the work lives, at most ${H.links.max}: repository, branch, pull request, files, docs. ` +
    "Each item has a short label and a full https URL. The code and documents stay where they are; " +
    "the handoff only points to them.",
  claims:
    "Optional. The decisions, facts, assumptions and open questions from this part of the work, written as " +
    "for propose_claims (one self-contained statement each). They are saved to the shared memory like any " +
    `claim and checked against what the team already knows. At most ${LIMITS.claimsPerCall}.`,
} as const;

const Link = z.object({
  label: z.string().trim().min(1).max(H.linkLabel.max),
  url: z
    .string()
    .trim()
    .max(H.linkUrl.max)
    .regex(/^https?:\/\/\S+$/i, "must be a full http(s) URL"),
});

/** The handoff fields as ingest accepts them (claims are validated separately, per item). */
export const HandoffFields = z.object({
  title: z.string().trim().min(H.title.min).max(H.title.max),
  area: z.string().trim().min(1).max(H.area.max).optional(),
  recipient: z.string().trim().min(1).max(H.recipient.max).optional(),
  summary: z.string().trim().min(H.summary.min).max(H.summary.max),
  next_steps: z.array(z.string().trim().min(H.nextStep.min).max(H.nextStep.max)).max(H.nextSteps.max).default([]),
  links: z.array(Link).max(H.links.max).default([]),
});
export type HandoffFields = z.infer<typeof HandoffFields>;

const ProjectId = z.uuid().describe("The project's id. Call list_projects first if you do not have it.");

/**
 * The create_handoff tool input as advertised: full guidance, loose types,
 * so ingest (not the SDK) reports problems in words the model can act on.
 */
export const CreateHandoffInput = z.object({
  project_id: ProjectId,
  model: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.label.max)
    .describe("Your own model name and version, e.g. 'claude-opus-5-5' or 'gpt-5'. Recorded as provenance."),
  title: z.string().describe(DOCS.title),
  area: z.string().optional().describe(DOCS.area),
  recipient: z.string().optional().describe(DOCS.recipient),
  summary: z.string().describe(DOCS.summary),
  next_steps: z.array(z.string()).optional().describe(DOCS.next_steps),
  links: z
    .array(z.object({ label: z.string(), url: z.string() }))
    .optional()
    .describe(DOCS.links),
  claims: z.array(ProposedClaimDraft).max(LIMITS.claimsPerCall).optional().describe(DOCS.claims),
});
export type CreateHandoffInput = z.infer<typeof CreateHandoffInput>;

export const GetHandoffsInput = z.object({
  project_id: ProjectId,
  limit: z
    .number()
    .int()
    .min(1)
    .max(H.listMax)
    .optional()
    .describe(`How many recent handoffs to return, newest first. Default ${H.listDefault}, max ${H.listMax}.`),
});
export type GetHandoffsInput = z.infer<typeof GetHandoffsInput>;

/** A stored handoff, as read paths return it. Claims show their current status. */
export const HandoffView = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  title: z.string(),
  area: z.string().nullable(),
  recipient: z.string().nullable(),
  summary: z.string(),
  nextSteps: z.array(z.string()),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
  createdAt: z.string(),
  provenance: z.object({
    sourceId: z.uuid(),
    authorId: z.uuid().nullable(),
    author: z.string(),
    model: z.string(),
    client: z.string(),
  }),
  claims: z.array(ClaimView),
});
export type HandoffView = z.infer<typeof HandoffView>;
