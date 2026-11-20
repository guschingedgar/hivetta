import {
  CLIENT_INFO_META_KEY,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  McpServer,
  oauthMetadataResponse,
  requireBearerAuth,
  type AuthInfo,
} from "@modelcontextprotocol/server";
import type { Embedder } from "@memory/embeddings";
import { createUserStore } from "@memory/store";
import { createAuthServerMetadataLoader, createSupabaseTokenVerifier } from "./auth";
import { registerTools } from "./tools";

export interface McpEndpointConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
  /** Public URL of the MCP endpoint, e.g. https://memory.example.com/api/mcp */
  resourceUrl: URL;
  embedder: Embedder;
}

const INSTRUCTIONS =
  "Hivetta: shared team memory. Teammates using different AI assistants save decisions, facts, assumptions and open " +
  "questions here, each with provenance, and retrieve them later from any assistant. Typical flow: " +
  "list_projects to find the project, get_project_brief at the start of a conversation, search_memory when a " +
  "question touches past work, and propose_claims when the user asks to save what was decided.";

const AUTO_INSTRUCTIONS = {
  off: "",
  drafts:
    " This user turned on auto-save (to drafts): save settled decisions, facts, assumptions and open questions on " +
    "your own initiative with propose_claims and auto: true, and tell the user in one line what you saved.",
  memory:
    " This user turned on auto-save: save settled decisions, facts, assumptions and open questions on your own " +
    "initiative with propose_claims and auto: true, and tell the user in one line what you saved.",
} as const;

/**
 * The MCP surface as two web-standard handlers. Hosts (a Next.js route, a
 * node:http server) mount them; nothing here depends on the host.
 */
export function createMcpEndpoint(config: McpEndpointConfig) {
  const verifier = createSupabaseTokenVerifier(config.supabaseUrl);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(config.resourceUrl);
  const gate = requireBearerAuth({ verifier, resourceMetadataUrl });
  const loadAuthServerMetadata = createAuthServerMetadataLoader(config.supabaseUrl);

  // A fresh server per request, bound to that request's verified caller.
  const handler = createMcpHandler(
    async ({ authInfo, requestInfo }) => {
      if (!authInfo) throw new Error("unauthenticated request reached the MCP handler");
      const { userId, email } = authInfo.extra as { userId: string; email: string | null };

      // Our tool list never changes at runtime, so say so. With listChanged
      // true (the SDK default once tools are registered), 2026-era clients
      // hold a `subscriptions/listen` stream open waiting for change
      // notifications; on serverless hosts that stream runs until the
      // platform kills it (Vercel: 300 s), every few minutes, per client.
      // With false, the SDK acknowledges the subscription and closes it at once.
      const store = createUserStore({
        url: config.supabaseUrl,
        publishableKey: config.supabasePublishableKey,
        accessToken: authInfo.token,
        userId,
      });
      // The person's auto-save setting decides what the save tool tells their AI.
      const [autoSave, displayName] = await Promise.all([
        store.getAutoSave().catch(() => "off" as const),
        store.getMyName().catch(() => null),
      ]);
      const server = new McpServer(
        {
          name: "hivetta",
          title: "Hivetta",
          version: "0.1.0",
          websiteUrl: new URL(config.resourceUrl).origin,
          // Clients that show server icons (MCP 2025-11-25+) pick this up on their own.
          icons: [
            { src: `${new URL(config.resourceUrl).origin}/hivetta-icon.png`, mimeType: "image/png", sizes: ["256x256"] },
            { src: `${new URL(config.resourceUrl).origin}/hivetta-mark.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
          ],
        },
        { instructions: INSTRUCTIONS + AUTO_INSTRUCTIONS[autoSave], capabilities: { tools: { listChanged: false } } },
      );
      registerTools(server, {
        store,
        autoSave,
        displayName: displayName ?? email ?? undefined,
        embedder: config.embedder,
        principal: {
          userId,
          label: email ?? userId,
          clientId: authInfo.clientId === "first-party" ? null : authInfo.clientId,
        },
        clientName: (meta) => resolveClientName(meta, server, requestInfo, authInfo),
      });
      return server;
    },
    { legacy: "stateless", onerror: (err) => console.error("[mcp]", err) },
  );

  return {
    /** The MCP endpoint itself: bearer-gated. */
    async handleMcp(request: Request): Promise<Response> {
      const auth = await gate(request);
      if (auth instanceof Response) return auth;
      return handler.fetch(request, { authInfo: auth });
    },

    /**
     * OAuth discovery (RFC 9728 protected-resource metadata, and a mirror of
     * Supabase's RFC 8414 metadata). Undefined for any other path.
     */
    async handleWellKnown(request: Request): Promise<Response | undefined> {
      let oauthMetadata;
      try {
        oauthMetadata = await loadAuthServerMetadata();
      } catch (err) {
        console.error("[mcp]", err);
        return Response.json(
          { error: "temporarily_unavailable", error_description: "Authorization server metadata unavailable." },
          { status: 503 },
        );
      }
      return oauthMetadataResponse(request, {
        oauthMetadata,
        resourceServerUrl: config.resourceUrl,
        resourceName: "Hivetta",
        scopesSupported: ["openid", "email", "profile"],
      });
    },
  };
}

/**
 * Which client (Claude, ChatGPT, ...) is calling, for provenance. Best-effort:
 * modern requests carry client info per request; 2025-era stateless requests
 * do not repeat the handshake, so fall back to the User-Agent, then the
 * OAuth client id.
 */
function resolveClientName(
  meta: unknown,
  server: McpServer,
  request: Request | undefined,
  auth: AuthInfo,
): string | undefined {
  const fromMeta = (meta as Record<string, { name?: unknown } | undefined> | undefined)?.[CLIENT_INFO_META_KEY]?.name;
  if (typeof fromMeta === "string" && fromMeta) return fromMeta;
  const fromHandshake = server.server.getClientVersion()?.name;
  if (fromHandshake) return fromHandshake;
  const ua = request?.headers.get("user-agent")?.split(/[\s/]/)[0];
  if (ua) return ua;
  return auth.clientId;
}
