import { describe, expect, it, vi } from "vitest";
import { createFakeEmbedder, createKeywordOnlyEmbedder, EmbeddingUnavailableError, type Embedder } from "@memory/embeddings";
import type { ClaimView } from "@memory/schema";
import { StoreError, type UserStore } from "@memory/store";
import { ingestClaims, IngestError, type IngestRequest } from "./ingest";

const USER = "8f14e45f-ceea-467a-9575-6e1b0e4d2a11";
const PROJECT = "c9f0f895-fb98-4b91-a5c3-1d6f6b5c3e72";

function request(overrides: Partial<IngestRequest> = {}): IngestRequest {
  return {
    projectId: PROJECT,
    principal: { userId: USER, label: "ada@example.com", clientId: "client-123" },
    model: "claude-opus-5-5",
    client: "claude-ai",
    claims: [
      { text: "The billing service uses Stripe Checkout to keep PCI scope minimal.", type: "decision" },
      { text: "nope", type: "fact" },
      { text: "Should the free tier support SSO?", type: "open_question", confidence: 0.4 },
    ],
    rawPayload: { tool: "propose_claims" },
    ...overrides,
  };
}

function fakeStore(impl?: UserStore["ingest"]) {
  const ingest = vi.fn<UserStore["ingest"]>(
    impl ??
      (async (source, claims) =>
        claims.map(
          (c, i): ClaimView => ({
            id: `00000000-0000-4000-8000-00000000000${i}`,
            projectId: source.projectId,
            text: c.text,
            type: c.type,
            status: "proposed",
            confidence: c.confidence ?? null,
            createdAt: "2026-10-13T00:00:00Z",
            supersededBy: null, rationale: null, details: null, links: null,
            provenance: {
              sourceId: "00000000-0000-4000-8000-0000000000ff",
              authorId: USER,
              author: source.provenance.authorLabel,
              model: source.provenance.model,
              client: source.provenance.client,
              recordedAt: "2026-10-13T00:00:00Z",
            },
          }),
        )),
  );
  return { ingest };
}

describe("ingestClaims", () => {
  it("stores proposals without vectors in the free keyword-only mode", async () => {
    const store = fakeStore();
    await ingestClaims({ store, embedder: createKeywordOnlyEmbedder() }, request());
    const claims = store.ingest.mock.calls[0]![1];
    expect(claims).toHaveLength(2);
    expect(claims[0]).toMatchObject({ embedding: null, embeddingModel: null });
  });

  it("stores valid claims with provenance and embeddings, and reports rejects", async () => {
    const store = fakeStore();
    const result = await ingestClaims({ store, embedder: createFakeEmbedder() }, request());

    expect(result.stored.map((c) => c.text)).toEqual([
      "The billing service uses Stripe Checkout to keep PCI scope minimal.",
      "Should the free tier support SSO?",
    ]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.index).toBe(1);

    const [source, claims] = store.ingest.mock.calls[0]!;
    expect(source.provenance).toEqual({
      authorId: USER,
      authorLabel: "ada@example.com",
      model: "claude-opus-5-5",
      client: "claude-ai",
      clientId: "client-123",
    });
    expect(source.rawPayload).toEqual({ tool: "propose_claims" });
    expect(claims).toHaveLength(2);
    expect(claims[0]!.embedding).toHaveLength(1536);
    expect(claims[0]!.embeddingModel).toBe("fake-hash-v1");
    expect(claims[1]!.confidence).toBe(0.4);
  });

  it.each([
    ["model", { model: "  " }],
    ["client", { client: "" }],
    ["author label", { principal: { userId: USER, label: "", clientId: null } }],
    ["author id", { principal: { userId: "not-a-uuid", label: "ada@example.com", clientId: null } }],
  ])("refuses the whole call when provenance is missing its %s", async (_label, overrides) => {
    const store = fakeStore();
    await expect(ingestClaims({ store, embedder: createFakeEmbedder() }, request(overrides))).rejects.toMatchObject({
      code: "provenance",
      retryable: false,
    });
    expect(store.ingest).not.toHaveBeenCalled();
  });

  it("writes nothing, not even a source, when every claim is rejected", async () => {
    const store = fakeStore();
    const embedder = createFakeEmbedder();
    const embed = vi.spyOn(embedder, "embed");
    const result = await ingestClaims({ store, embedder }, request({ claims: [{ text: "x", type: "fact" }] }));
    expect(result).toEqual({ stored: [], rejected: [expect.objectContaining({ index: 0 })] });
    expect(embed).not.toHaveBeenCalled();
    expect(store.ingest).not.toHaveBeenCalled();
  });

  it("stores nothing and asks for a retry when embedding is down", async () => {
    const store = fakeStore();
    const embedder: Embedder = {
      model: "down",
      embed: async () => {
        throw new EmbeddingUnavailableError(new Error("503"));
      },
    };
    await expect(ingestClaims({ store, embedder }, request())).rejects.toMatchObject({
      code: "embedding_unavailable",
      retryable: true,
    });
    expect(store.ingest).not.toHaveBeenCalled();
  });

  it.each([
    ["forbidden", "forbidden", false],
    ["not_found", "forbidden", false],
    ["invalid", "invalid", false],
    ["unavailable", "unavailable", true],
  ] as const)("maps a %s store error to %s", async (storeCode, code, retryable) => {
    const store = fakeStore(async () => {
      throw new StoreError(storeCode, "boom");
    });
    const err = await ingestClaims({ store, embedder: createFakeEmbedder() }, request()).catch((e) => e);
    expect(err).toBeInstanceOf(IngestError);
    expect(err).toMatchObject({ code, retryable });
  });
});
