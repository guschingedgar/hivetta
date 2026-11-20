import { LIMITS, LIVE_STATUSES, SearchMemoryInput } from "@memory/schema";
import type { SearchParams } from "@memory/store";

export interface SearchRequest {
  projectId: string;
  params: Omit<SearchParams, "embedding" | "embeddingModel">;
}

/**
 * Validates a search request and translates it into store parameters.
 * Pure, so the filter semantics are unit tested without a database. Every
 * filter is pushed down into SQL; nothing is filtered in JS after ranking,
 * which would silently return fewer results than asked for.
 */
export function buildSearchRequest(input: unknown): SearchRequest {
  const parsed = SearchMemoryInput.parse(input);
  const f = parsed.filters ?? {};
  return {
    projectId: parsed.project_id,
    params: {
      query: parsed.query,
      types: f.types ? dedupe(f.types) : undefined,
      // Superseded and rejected claims are history: only returned when asked for.
      statuses: f.statuses ? dedupe(f.statuses) : [...LIVE_STATUSES],
      authorId: f.author_id,
      model: f.model,
      since: f.since ? new Date(f.since).toISOString() : undefined,
      limit: Math.min(parsed.limit ?? LIMITS.searchResults.default, LIMITS.searchResults.max),
    },
  };
}

function dedupe<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
