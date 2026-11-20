import { NextResponse } from "next/server";
import { getSession, storeFor } from "@/lib/session";
import { aiName } from "@/lib/data";

// Polled by the setup page while it waits for the user's AI to save a first memory.
export async function GET() {
  const session = await getSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const store = storeFor(session);
  const sources = await store.listMySources(1).catch(() => []);
  const latest = sources[0];
  let text: string | null = null;
  if (latest) {
    const claims = await store.listClaims(latest.projectId, { limit: 1 }).catch(() => []);
    text = claims[0]?.text ?? null;
  }
  return NextResponse.json(
    { connected: Boolean(latest), ai: latest ? aiName(latest.client) : null, text },
    { headers: { "cache-control": "no-store" } },
  );
}
