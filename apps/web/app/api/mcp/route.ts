import { mcpEndpoint } from "@/lib/mcp";

// The MCP surface. All logic lives in @memory/mcp-server; this only mounts it.
export const dynamic = "force-dynamic";

const handle = (request: Request) => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return Response.json({ error: "MCP non configuré : renseigner les variables Supabase." }, { status: 503 });
  }
  return mcpEndpoint(request).handleMcp(request);
};
export { handle as GET, handle as POST, handle as DELETE };
