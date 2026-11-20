// End-to-end smoke test of the MCP surface against the dev Supabase project.
// Drives the real endpoint with real JSON-RPC as two different users and
// clients, and checks the phase-1 goal: a claim written from one assistant is
// retrievable from another, with provenance intact.
//
// Run: pnpm --filter @memory/mcp-server smoke
// Writes permanent rows (invariant 2) into the "Smoke tests" workspace.

import { createFakeEmbedder, embedderFromEnv } from "@memory/embeddings";
import { createUserStore } from "@memory/store";
import { createMcpEndpoint } from "../src";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set (see .env.example)`);
  return v;
};
const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const KEY = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const RUN = Math.random().toString(36).slice(2, 8);

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "[ok]  " : "[FAIL]"} ${label}${!ok && detail !== undefined ? `\n       ${JSON.stringify(detail).slice(0, 600)}` : ""}`);
  if (!ok) failures++;
}

async function signIn(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; user: { id: string } };
  return { token: body.access_token, userId: body.user.id };
}

const embedder = process.env.OPENAI_API_KEY ? embedderFromEnv() : createFakeEmbedder();
const endpoint = createMcpEndpoint({
  supabaseUrl: SUPABASE_URL,
  supabasePublishableKey: KEY,
  resourceUrl: new URL("http://localhost:3000/api/mcp"),
  embedder,
});

let rpcId = 0;
async function rpc(token: string | null, userAgent: string, method: string, params: unknown) {
  const res = await endpoint.handleMcp(
    new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        "user-agent": userAgent,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
  );
  const text = await res.text();
  // Streamable HTTP may answer as SSE; take the last data: line.
  const json = res.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop()
    : text;
  return { status: res.status, headers: res.headers, body: json ? JSON.parse(json) : null };
}

async function callTool(token: string, ua: string, name: string, args: unknown) {
  const { body } = await rpc(token, ua, "tools/call", { name, arguments: args });
  if (body?.error) throw new Error(`${name}: ${JSON.stringify(body.error)}`);
  return body.result as { isError?: boolean; structuredContent?: any; content: { text: string }[] };
}

console.log(`smoke run ${RUN}, embedder ${embedder.model}\n`);

// --- setup: A owns a project in the Smoke tests workspace; B is a contributor
const A = await signIn(env("SMOKE_A_EMAIL"), env("SMOKE_A_PASSWORD"));
const B = await signIn(env("SMOKE_B_EMAIL"), env("SMOKE_B_PASSWORD"));
const storeA = createUserStore({ url: SUPABASE_URL, publishableKey: KEY, accessToken: A.token, userId: A.userId });
const workspaceId =
  (await storeA.listWorkspaces()).find((w) => w.name === "Smoke tests")?.id ?? (await storeA.createWorkspace("Smoke tests"));
const projectId =
  (await storeA.listProjects()).find((p) => p.name === "Smoke project")?.id ??
  (await storeA.createProject(workspaceId, "Smoke project"));
await storeA.inviteMember(workspaceId, env("SMOKE_B_EMAIL"), "contributor");

// --- auth
const anon = await rpc(null, "curl", "tools/list", {});
check("no token -> 401", anon.status === 401, anon.status);
check(
  "401 advertises protected-resource metadata",
  (anon.headers.get("www-authenticate") ?? "").includes("resource_metadata="),
  anon.headers.get("www-authenticate"),
);
const forged = await rpc(A.token.slice(0, -4) + "AAAA", "curl", "tools/list", {});
check("tampered token -> 401", forged.status === 401, forged.status);

// --- A, from "Claude"
const CLAUDE = "Claude-User";
const tools = await rpc(A.token, CLAUDE, "tools/list", {});
const toolNames = (tools.body?.result?.tools ?? []).map((t: { name: string }) => t.name).sort();
check("tools/list exposes the 5 tools", JSON.stringify(toolNames) === JSON.stringify(
  ["get_project_brief", "list_open_questions", "list_projects", "propose_claims", "search_memory"]), toolNames);

const projects = await callTool(A.token, CLAUDE, "list_projects", {});
check("list_projects finds the project", projects.structuredContent?.projects?.some((p: any) => p.id === projectId), projects);

const decision = `Smoke ${RUN}: the billing service uses Stripe Checkout to keep PCI scope minimal.`;
const question = `Smoke ${RUN}: should the free tier include SSO?`;
const proposed = await callTool(A.token, CLAUDE, "propose_claims", {
  project_id: projectId,
  model: "claude-opus-5-5",
  claims: [
    { text: decision, type: "decision", confidence: 0.9 },
    { text: `Smoke ${RUN}: invoices are generated nightly at 02:00 UTC by the billing worker.`, type: "fact" },
    { text: question, type: "open_question" },
    { text: "It was agreed to move fast.", type: "decision" },
    { text: "x", type: "idea" },
  ],
});
const sc = proposed.structuredContent;
check("propose_claims stores the 3 good claims", sc?.stored?.length === 3, sc);
check(
  "propose_claims rejects the 2 bad ones with reasons, by index",
  JSON.stringify(sc?.rejected?.map((r: any) => r.index)) === "[3,4]" && sc.rejected.every((r: any) => r.reasons.length > 0),
  sc?.rejected,
);
const decisionId = sc?.stored?.find((c: any) => c.text === decision)?.id;

// A reviews and accepts the decision (what the web UI does)
await storeA.setClaimStatus(decisionId, "accepted");

// --- B, from "ChatGPT"
const CHATGPT = "openai-mcp/1.0.0";
const brief = await callTool(B.token, CHATGPT, "get_project_brief", { project_id: projectId });
const inBrief = brief.structuredContent?.decisions?.find((c: any) => c.id === decisionId);
check("B's brief contains A's accepted decision", !!inBrief, brief.structuredContent);
check(
  "...with provenance intact (author, model, client)",
  inBrief?.saved_by === env("SMOKE_A_EMAIL") && inBrief?.model === "claude-opus-5-5" && inBrief?.client === CLAUDE,
  inBrief,
);

const search = await callTool(B.token, CHATGPT, "search_memory", { project_id: projectId, query: `Smoke ${RUN} nightly invoices` });
const hits = search.structuredContent?.results ?? [];
check("B's search finds A's still-proposed fact", hits.some((h: any) => h.status === "proposed" && h.text.includes("nightly")), hits);

const filtered = await callTool(B.token, CHATGPT, "search_memory", {
  project_id: projectId,
  query: `Smoke ${RUN}`,
  filters: { types: ["decision"], statuses: ["accepted"] },
});
const fhits = filtered.structuredContent?.results ?? [];
check("filters narrow to accepted decisions only", fhits.length > 0 && fhits.every((h: any) => h.type === "decision" && h.status === "accepted"), fhits);

if (process.env.OPENAI_API_KEY) {
  // No words in common with the stored fact: only the semantic leg can find it.
  const semantic = await callTool(B.token, CHATGPT, "search_memory", {
    project_id: projectId,
    query: "when do customers' bills get created each day?",
    filters: { since: new Date(Date.now() - 10 * 60_000).toISOString() },
  });
  const top = semantic.structuredContent?.results?.[0];
  check("semantic search finds a paraphrase with no shared words", !!top?.text.includes("nightly") && top.matched_by !== "keyword", semantic.structuredContent);
}

const open = await callTool(B.token, CHATGPT, "list_open_questions", { project_id: projectId });
check("B sees A's open question", open.structuredContent?.open_questions?.some((q: any) => q.text === question), open.structuredContent);

const badFilter = await callTool(B.token, CHATGPT, "search_memory", { project_id: projectId, query: "x", filters: { type: ["fact"] } }).catch(
  (e: Error) => ({ isError: true, content: [{ text: e.message }] }),
);
check("a malformed filter is refused, not ignored", badFilter.isError === true, badFilter);

const stranger = await callTool(B.token, CHATGPT, "get_project_brief", { project_id: crypto.randomUUID() });
check("unknown project -> tool error, no leak", stranger.isError === true && /no access/.test(stranger.content[0]!.text), stranger);

const wk = await endpoint.handleWellKnown(new Request("http://localhost:3000/.well-known/oauth-protected-resource/api/mcp"));
console.log(`\n[info] protected-resource metadata: HTTP ${wk?.status} ${wk?.status === 503 ? "(Supabase OAuth server not enabled yet)" : ""}`);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
