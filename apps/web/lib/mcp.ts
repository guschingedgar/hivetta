import { createKeywordOnlyEmbedder, embedderFromEnv, type Embedder } from "@memory/embeddings";
import { createMcpEndpoint } from "@memory/mcp-server";
import { env } from "@/lib/env";

const endpoints = new Map<string, ReturnType<typeof createMcpEndpoint>>();
let shared: Embedder | undefined;

/** The same embedder the MCP tools use, so web search ranks exactly like assistants' search. */
export function embedder(): Embedder {
  if (shared) return shared;
  if (process.env.OPENAI_API_KEY) return (shared = embedderFromEnv());
  console.info("[mcp] OPENAI_API_KEY not set: keyword-only search enabled");
  return (shared = createKeywordOnlyEmbedder());
}

/**
 * The site answers on its main address (APP_URL) and on older ones (MCP_EXTRA_ORIGINS, comma-separated),
 * so connectors added with an old address keep working. Each address gets its own endpoint, because the
 * OAuth metadata must name the exact URL the client connected to. Unknown hosts get the main address.
 */
function originFor(request?: Request): string {
  const main = new URL(env.appUrl).origin;
  if (!request) return main;
  const extra = (process.env.MCP_EXTRA_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  const here = new URL(request.url).origin;
  return [main, ...extra].includes(here) ? here : main;
}

/** One endpoint per address per server process; each builds a fresh MCP server per request. */
export function mcpEndpoint(request?: Request) {
  const origin = originFor(request);
  let endpoint = endpoints.get(origin);
  if (!endpoint) {
    endpoint = createMcpEndpoint({
      supabaseUrl: env.supabaseUrl,
      supabasePublishableKey: env.supabaseKey,
      resourceUrl: new URL("/api/mcp", origin),
      embedder: embedder(),
    });
    endpoints.set(origin, endpoint);
  }
  return endpoint;
}
