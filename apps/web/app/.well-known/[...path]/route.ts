import { mcpEndpoint } from "@/lib/mcp";

// OAuth discovery for MCP clients: RFC 9728 protected-resource metadata at
// /.well-known/oauth-protected-resource/api/mcp, and a mirror of Supabase's
// RFC 8414 authorization-server metadata.
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return Response.json({ error: "MCP non configuré : renseigner les variables Supabase." }, { status: 503 });
  }
  return (await mcpEndpoint(request).handleWellKnown(request)) ?? new Response("Not found", { status: 404 });
}
export { handle as GET, handle as OPTIONS };
