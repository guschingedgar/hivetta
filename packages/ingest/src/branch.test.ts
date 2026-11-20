import { describe, expect, it, vi } from "vitest";
import { createFakeEmbedder } from "@memory/embeddings";
import type { ClaimView } from "@memory/schema";
import type { UserStore } from "@memory/store";
import { fromProposeClaims, toProposeClaimsResult } from "./adapters/mcp";
import { ingestClaims, IngestError, type IngestRequest } from "./ingest";

const USER = "8f14e45f-ceea-467a-9575-6e1b0e4d2a11";
const PROJECT = "c9f0f895-fb98-4b91-a5c3-1d6f6b5c3e72";
const principal = { userId: USER, label: "ada@example.com", clientId: null };

function request(overrides: Partial<IngestRequest> = {}): IngestRequest {
  return {
    projectId: PROJECT,
    principal,
    model: "gpt-5",
    client: "chatgpt",
    claims: [{ text: "The shop could switch payments to PayPal for lower fees.", type: "decision" }],
    rawPayload: {},
    ...overrides,
  };
}

function fakeStore() {
  return {
    ingest: vi.fn<UserStore["ingest"]>(async (source, claims) =>
      claims.map(
        (c, i): ClaimView => ({
          id: `00000000-0000-4000-8000-00000000000${i}`,
          projectId: source.projectId,
          text: c.text,
          type: c.type,
          status: "proposed",
          confidence: null,
          createdAt: "2026-11-08T00:00:00Z",
          supersededBy: null, rationale: null, details: null, links: null,
          provenance: {
            sourceId: "00000000-0000-4000-8000-0000000000bb",
            authorId: USER,
            author: "ada@example.com",
            model: "gpt-5",
            client: "chatgpt",
            recordedAt: "2026-11-08T00:00:00Z",
          },
        }),
      ),
    ),
  };
}

describe("saving claims to a branch", () => {
  it("passes the branch to the store and reports the claims as drafts", async () => {
    const store = fakeStore();
    const result = await ingestClaims(
      { store, embedder: createFakeEmbedder() },
      request({ branch: { name: " payments-v2 ", gitBranch: "feature/paypal" } }),
    );
    expect(store.ingest.mock.calls[0]![2]).toEqual({ branch: "payments-v2", gitBranch: "feature/paypal" });
    expect(result.branch).toBe("payments-v2");
    const out = toProposeClaimsResult(result);
    expect(out.summary).toMatch(/drafts in branch "payments-v2"/);
    expect(out.summary).toMatch(/merge_branch/);
  });

  it("saves to main memory when no branch is given", async () => {
    const store = fakeStore();
    const result = await ingestClaims({ store, embedder: createFakeEmbedder() }, request());
    expect(store.ingest.mock.calls[0]![2]).toEqual({});
    expect(result.branch).toBeUndefined();
    expect(toProposeClaimsResult(result).summary).toMatch(/AI reviewer/);
  });

  it("stores nothing when the branch name is invalid", async () => {
    const store = fakeStore();
    const err = await ingestClaims({ store, embedder: createFakeEmbedder() }, request({ branch: { name: "my branch!" } })).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(IngestError);
    expect(err.code).toBe("invalid");
    expect(err.message).toMatch(/branch name/);
    expect(store.ingest).not.toHaveBeenCalled();
  });

  it("maps the MCP branch fields, ignoring an empty branch", () => {
    const base = { project_id: PROJECT, model: "gpt-5", claims: [] };
    expect(fromProposeClaims({ ...base, branch: "payments-v2", git_branch: "feature/paypal" }, { principal }).branch).toEqual({
      name: "payments-v2",
      gitBranch: "feature/paypal",
    });
    expect(fromProposeClaims({ ...base, branch: "  " }, { principal }).branch).toBeUndefined();
  });
});
