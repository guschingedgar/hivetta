import { describe, expect, it, vi } from "vitest";
import { createFakeEmbedder, createKeywordOnlyEmbedder, EmbeddingUnavailableError } from "@memory/embeddings";
import type { UserStore } from "@memory/store";
import { buildSearchRequest } from "./filters";
import { searchMemory } from "./retrieval";

const PROJECT = "c9f0f895-fb98-4b91-a5c3-1d6f6b5c3e72";
const AUTHOR = "8f14e45f-ceea-467a-9575-6e1b0e4d2a11";
const base = { project_id: PROJECT, query: "payment provider" };

describe("buildSearchRequest: defaults", () => {
  it("searches live claims only, 10 results, no other filters", () => {
    expect(buildSearchRequest(base)).toEqual({
      projectId: PROJECT,
      params: {
        query: "payment provider",
        types: undefined,
        statuses: ["proposed", "accepted"],
        authorId: undefined,
        model: undefined,
        since: undefined,
        limit: 10,
      },
    });
  });

  it("never returns superseded or rejected claims unless asked", () => {
    const { params } = buildSearchRequest({ ...base, filters: { types: ["decision"] } });
    expect(params.statuses).not.toContain("superseded");
    expect(params.statuses).not.toContain("rejected");
  });

  it("trims the query", () => {
    expect(buildSearchRequest({ ...base, query: "  stripe  " }).params.query).toBe("stripe");
  });
});

describe("buildSearchRequest: each filter maps to its store parameter", () => {
  it("types", () => {
    expect(buildSearchRequest({ ...base, filters: { types: ["decision", "assumption"] } }).params.types).toEqual([
      "decision",
      "assumption",
    ]);
  });

  it("statuses, including history when explicitly requested", () => {
    const { params } = buildSearchRequest({ ...base, filters: { statuses: ["accepted", "superseded"] } });
    expect(params.statuses).toEqual(["accepted", "superseded"]);
  });

  it("author_id", () => {
    expect(buildSearchRequest({ ...base, filters: { author_id: AUTHOR } }).params.authorId).toBe(AUTHOR);
  });

  it("model, trimmed", () => {
    expect(buildSearchRequest({ ...base, filters: { model: " gpt-5 " } }).params.model).toBe("gpt-5");
  });

  it("since, normalised to UTC ISO", () => {
    expect(buildSearchRequest({ ...base, filters: { since: "2026-10-01T09:00:00+02:00" } }).params.since).toBe(
      "2026-10-01T07:00:00.000Z",
    );
  });

  it("combines filters (AND) without dropping any", () => {
    const { params } = buildSearchRequest({
      ...base,
      filters: { types: ["fact"], statuses: ["accepted"], author_id: AUTHOR, model: "gpt-5", since: "2026-01-01T00:00:00Z" },
      limit: 3,
    });
    expect(params).toMatchObject({
      types: ["fact"],
      statuses: ["accepted"],
      authorId: AUTHOR,
      model: "gpt-5",
      since: "2026-01-01T00:00:00.000Z",
      limit: 3,
    });
  });

  it("removes duplicate values", () => {
    const { params } = buildSearchRequest({ ...base, filters: { types: ["fact", "fact"], statuses: ["accepted", "accepted"] } });
    expect(params.types).toEqual(["fact"]);
    expect(params.statuses).toEqual(["accepted"]);
  });
});

describe("buildSearchRequest: rejects bad input instead of guessing", () => {
  it.each([
    ["an unknown filter key", { filters: { project: "other" } }],
    ["a misspelled filter key", { filters: { type: ["fact"] } }],
    ["an unknown type", { filters: { types: ["idea"] } }],
    ["an unknown status", { filters: { statuses: ["deleted"] } }],
    ["an empty types list", { filters: { types: [] } }],
    ["an empty statuses list", { filters: { statuses: [] } }],
    ["a non-uuid author", { filters: { author_id: "ada" } }],
    ["an empty model", { filters: { model: "   " } }],
    ["a since without timezone", { filters: { since: "2026-10-01T09:00:00" } }],
    ["a since that is not a date", { filters: { since: "last week" } }],
    ["a limit of 0", { limit: 0 }],
    ["a limit above 50", { limit: 51 }],
    ["a fractional limit", { limit: 2.5 }],
    ["an empty query", { query: "  " }],
    ["a non-uuid project", { project_id: "my-project" }],
  ])("%s", (_label, overrides) => {
    expect(() => buildSearchRequest({ ...base, ...overrides })).toThrow();
  });
});

describe("searchMemory", () => {
  function store() {
    return {
      searchClaims: vi.fn<UserStore["searchClaims"]>(async () => []),
      listClaims: vi.fn(),
      getProject: vi.fn(),
      listProjects: vi.fn(),
      listHandoffs: vi.fn(),
      listBranches: vi.fn(),
      getBranchClaims: vi.fn(),
    };
  }

  it("passes the translated filters and the query embedding to the store", async () => {
    const s = store();
    await searchMemory({ store: s, embedder: createFakeEmbedder() }, { ...base, filters: { types: ["decision"] }, limit: 5 });
    const [projectId, params] = s.searchClaims.mock.calls[0]!;
    expect(projectId).toBe(PROJECT);
    expect(params).toMatchObject({ query: "payment provider", types: ["decision"], statuses: ["proposed", "accepted"], limit: 5 });
    expect(params.embedding).toHaveLength(1536);
    expect(params.embeddingModel).toBe("fake-hash-v1");
  });

  it("searches by keywords when no paid embedding provider is configured", async () => {
    const s = store();
    const result = await searchMemory({ store: s, embedder: createKeywordOnlyEmbedder() }, base);
    expect(result.degraded).toBe(true);
    expect(s.searchClaims.mock.calls[0]![1]).toMatchObject({ embedding: null, embeddingModel: null });
  });

  it("falls back to keyword-only search, keeping the filters, when embedding is down", async () => {
    const s = store();
    const embedder = {
      model: "down",
      embed: async () => {
        throw new EmbeddingUnavailableError(new Error("503"));
      },
    };
    const result = await searchMemory({ store: s, embedder }, { ...base, filters: { types: ["fact"] } });
    expect(result.degraded).toBe(true);
    expect(s.searchClaims.mock.calls[0]![1]).toMatchObject({ embedding: null, embeddingModel: null, types: ["fact"] });
  });

  it("does not call the store when the input is invalid", async () => {
    const s = store();
    await expect(searchMemory({ store: s, embedder: createFakeEmbedder() }, { ...base, limit: 99 })).rejects.toThrow();
    expect(s.searchClaims).not.toHaveBeenCalled();
  });
});
