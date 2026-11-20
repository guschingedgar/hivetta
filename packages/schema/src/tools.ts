import { z } from "zod";
import { BRANCH_NAME_PATTERN, LIMITS } from "./enums";
import { ProposedClaimDraft } from "./claim";
import { SearchFilters, SearchLimit } from "./filters";

// Inputs of the MCP tools. snake_case because the calling model reads them.

const ProjectId = z
  .uuid()
  .describe("The project's id. Call list_projects first if you do not have it.");

export const ListProjectsInput = z.object({});

const BRANCH_DOC =
  "Letters, digits and . _ / - only, starting with a letter or digit, at most 60 characters, " +
  "e.g. 'payments-v2' or 'feature/paypal'.";

/** Strict branch name, as ingest and the branch tools accept it. */
export const BranchName = z.string().trim().regex(BRANCH_NAME_PATTERN, `invalid branch name. ${BRANCH_DOC}`);

export const ProposeClaimsInput = z.object({
  project_id: ProjectId,
  model: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.label.max)
    .describe("Your own model name and version, e.g. 'claude-opus-5-5' or 'gpt-5'. Recorded as provenance."),
  claims: z
    .array(ProposedClaimDraft)
    .min(1)
    .max(LIMITS.claimsPerCall)
    .describe(
      `The claims worth keeping from this conversation, at most ${LIMITS.claimsPerCall}. ` +
        "Prefer a few precise claims over many vague ones. Skip small talk, drafts that were abandoned, " +
        "and anything the user did not confirm.",
    ),
  auto: z
    .boolean()
    .optional()
    .describe(
      "Set true when you are saving on your own initiative because the user turned on auto-save, rather than " +
        "because the user asked you to save in this conversation. Leave it out otherwise.",
    ),
  branch: z
    .string()
    .optional()
    .describe(
      "Optional. Save these claims as drafts in a branch instead of the shared memory, only when the user " +
        "asks for a branch or says the work is exploratory and not decided yet. Drafts stay out of teammates' " +
        "briefs and searches and are not checked until the branch is merged with merge_branch. The branch is " +
        `created if it does not exist. ${BRANCH_DOC}`,
    ),
  git_branch: z
    .string()
    .optional()
    .describe("Optional, with branch: the git branch holding the matching code, recorded when the branch is created."),
});
export type ProposeClaimsInput = z.infer<typeof ProposeClaimsInput>;

export const SearchMemoryInput = z.object({
  project_id: ProjectId,
  query: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("What you want to know, in natural language. Include specific names: they are matched exactly as well as semantically."),
  filters: SearchFilters.optional(),
  limit: SearchLimit.optional(),
});
export type SearchMemoryInput = z.infer<typeof SearchMemoryInput>;

export const GetProjectBriefInput = z.object({ project_id: ProjectId });
export type GetProjectBriefInput = z.infer<typeof GetProjectBriefInput>;

export const ListOpenQuestionsInput = z.object({ project_id: ProjectId });
export type ListOpenQuestionsInput = z.infer<typeof ListOpenQuestionsInput>;

export const ListBranchesInput = z.object({
  project_id: ProjectId,
  name: z
    .string()
    .optional()
    .describe("Optional. A branch name: returns that branch's draft claims instead of the list of branches."),
});
export type ListBranchesInput = z.infer<typeof ListBranchesInput>;

export const MergeBranchInput = z.object({
  project_id: ProjectId,
  name: z.string().describe(`The branch to merge. ${BRANCH_DOC}`),
});
export type MergeBranchInput = z.infer<typeof MergeBranchInput>;
