import { z } from "zod";
import { CLAIM_STATUSES, CLAIM_TYPES, LIMITS } from "./enums";

export const SearchFilters = z
  .strictObject({
    types: z
      .array(z.enum(CLAIM_TYPES))
      .min(1)
      .optional()
      .describe("Only return claims of these types."),
    statuses: z
      .array(z.enum(CLAIM_STATUSES))
      .min(1)
      .optional()
      .describe(
        "Only return claims in these statuses. Defaults to proposed and accepted; " +
          "ask for superseded or rejected only when you need the history of a decision.",
      ),
    author_id: z.uuid().optional().describe("Only claims written by this user id."),
    model: z.string().trim().min(1).optional().describe("Only claims written by this model, exact name."),
    since: z.iso.datetime({ offset: true }).optional().describe("Only claims created at or after this ISO 8601 time."),
  })
  .describe("Optional filters, combined with AND.");
export type SearchFilters = z.infer<typeof SearchFilters>;

export const SearchLimit = z
  .number()
  .int()
  .min(1)
  .max(LIMITS.searchResults.max)
  .default(LIMITS.searchResults.default)
  .describe(`How many claims to return, 1 to ${LIMITS.searchResults.max}.`);
