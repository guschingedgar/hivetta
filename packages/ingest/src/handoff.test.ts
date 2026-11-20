import { describe, expect, it, vi } from "vitest";
import { createFakeEmbedder } from "@memory/embeddings";
import type { HandoffView } from "@memory/schema";
import { StoreError, type UserStore } from "@memory/store";
import { fromCreateHandoff, toCreateHandoffResult } from "./adapters/mcp";
import { createHandoff, IngestError, type HandoffRequest } from "./ingest";

const USER = "8f14e45f-ceea-467a-9575-6e1b0e4d2a11";
const PROJECT = "c9f0f895-fb98-4b91-a5c3-1d6f6b5c3e72";
const principal = { userId: USER, label: "ada@example.com", clientId: "client-123" };

const handoff = {
  title: "Payments module",
  area: "payments",
  recipient: "alex@example.com",
  summary: "Stripe Checkout works end to end in test mode; the webhook is not wired yet.",
  next_steps: ["Wire the checkout.session.completed webhook"],
  links: [{ label: "Repository", url: "https://github.com/acme/shop" }],
};

function request(overrides: Partial<HandoffRequest> = {}): HandoffRequest {
  return {
    projectId: PROJECT,
    principal,
    model: "claude-opus-5-5",
    client: "claude-ai",
    handoff,
    claims: [
      { text: "The shop takes payments with Stripe Checkout to keep PCI scope small.", type: "decision" },
      { text: "it works", type: "fact" },
    ],
    rawPayload: { tool: "create_handoff" },
    ...overrides,
  };
}

function fakeStore(impl?: UserStore["createHandoff"]) {
  return {
    createHandoff: vi.fn<UserStore["createHandoff"]>(
      impl ??
        (async (source, fields, claims): Promise<HandoffView> => ({
          id: "00000000-0000-4000-8000-0000000000aa",
          projectId: source.projectId,
          title: fields.title,
          area: fields.area ?? null,
          recipient: fields.recipient ?? null,
          summary: fields.summary,
          nextSteps: fields.next_steps,
          links: fields.links,
          createdAt: "2026-11-08T00:00:00Z",
          provenance: {
            sourceId: "00000000-0000-4000-8000-0000000000bb",
            authorId: USER,
            author: source.provenance.authorLabel,
            model: source.provenance.model,
            client: source.provenance.client,
          },
          claims: claims.map((c, i) => ({
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
              model: "claude-opus-5-5",
              client: "claude-ai",
              recordedAt: "2026-11-08T00:00:00Z",
            },
          })),
        })),
    ),
  };
}

describe("createHandoff", () => {
  it("stores the handoff with its valid claims and reports the invalid ones", async () => {
    const store = fakeStore();
    const result = await createHandoff({ store, embedder: createFakeEmbedder() }, request());

    const [source, fields, claims] = store.createHandoff.mock.calls[0]!;
    expect(source.provenance).toMatchObject({ authorId: USER, model: "claude-opus-5-5", client: "claude-ai" });
    expect(fields).toMatchObject({ title: "Payments module", area: "payments", next_steps: handoff.next_steps });
    expect(claims).toHaveLength(1);
    expect(claims[0]!.embedding).toHaveLength(1536);
    expect(result.handoff.claims).toHaveLength(1);
    expect(result.rejected).toEqual([expect.objectContaining({ index: 1, text: "it works" })]);
  });

  it("stores a handoff with no claims, defaulting next steps and links", async () => {
    const store = fakeStore();
    const { title, summary } = handoff;
    await createHandoff({ store, embedder: createFakeEmbedder() }, request({ handoff: { title, summary }, claims: [] }));
    const [, fields, claims] = store.createHandoff.mock.calls[0]!;
    expect(fields).toMatchObject({ next_steps: [], links: [] });
    expect(claims).toEqual([]);
  });

  it("stores nothing when a handoff field is invalid, and says which", async () => {
    const store = fakeStore();
    const bad = { ...handoff, summary: "too short", links: [{ label: "Repo", url: "github.com/acme" }] };
    const err = await createHandoff({ store, embedder: createFakeEmbedder() }, request({ handoff: bad })).catch((e) => e);
    expect(err).toBeInstanceOf(IngestError);
    expect(err.code).toBe("invalid");
    expect(err.message).toMatch(/summary/);
    expect(err.message).toMatch(/links\.0\.url/);
    expect(store.createHandoff).not.toHaveBeenCalled();
  });

  it("refuses to write without provenance", async () => {
    const store = fakeStore();
    const err = await createHandoff({ store, embedder: createFakeEmbedder() }, request({ model: " " })).catch((e) => e);
    expect(err).toBeInstanceOf(IngestError);
    expect(err.code).toBe("provenance");
    expect(store.createHandoff).not.toHaveBeenCalled();
  });

  it("maps a permission refusal from the database to a forbidden error", async () => {
    const store = fakeStore(async () => {
      throw new StoreError("forbidden", "new row violates row-level security policy", "42501");
    });
    const err = await createHandoff({ store, embedder: createFakeEmbedder() }, request()).catch((e) => e);
    expect(err).toBeInstanceOf(IngestError);
    expect(err.code).toBe("forbidden");
  });
});

describe("create_handoff MCP adapter", () => {
  it("splits the tool input into handoff fields, claims and provenance", () => {
    const req = fromCreateHandoff(
      { project_id: PROJECT, model: "gpt-5", ...handoff, claims: [{ text: "x", type: "fact" }] },
      { principal, clientName: "chatgpt" },
    );
    expect(req).toMatchObject({ projectId: PROJECT, model: "gpt-5", client: "chatgpt", claims: [{ text: "x" }] });
    expect(req.handoff).toEqual(handoff);
    expect(req.rawPayload).toMatchObject({ tool: "create_handoff" });
  });

  it("tells the model what was saved and how the next person picks it up", async () => {
    const result = await createHandoff({ store: fakeStore(), embedder: createFakeEmbedder() }, request());
    const out = toCreateHandoffResult(result);
    expect(out.summary).toMatch(/Payments module/);
    expect(out.summary).toMatch(/alex@example\.com/);
    expect(out.summary).toMatch(/propose_claims/);
    expect(out.rejected).toHaveLength(1);
  });
});
