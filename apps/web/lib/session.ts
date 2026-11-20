import { redirect } from "next/navigation";
import { cache } from "react";
import { createUserStore } from "@memory/store";
import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface Session {
  userId: string;
  email: string;
  accessToken: string;
  /** The name typed at sign-up, kept in the account until a profile row exists. */
  signupName: string | null;
}

/** Verified once per request (React cache), however many components ask. */
export const getSession = cache(async function getSession(): Promise<Session | null> {
  const supabase = await createSupabaseServerClient();
  // getClaims verifies the JWT signature; never authorise on getSession alone.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return null;
  const meta = (data.claims as { user_metadata?: { display_name?: unknown } }).user_metadata;
  const signupName = typeof meta?.display_name === "string" && meta.display_name.trim() ? meta.display_name.trim().slice(0, 40) : null;
  return { userId: data.claims.sub, email: String(data.claims.email ?? ""), accessToken: s.session.access_token, signupName };
});

export async function requireSession(returnTo: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return session;
}

/** A store that runs every query as this user, under RLS. */
export const storeFor = cache(function storeFor(session: Session) {
  return createUserStore({
    url: env.supabaseUrl,
    publishableKey: env.supabaseKey,
    accessToken: session.accessToken,
    userId: session.userId,
  });
});

/** Only same-origin relative paths, so ?next= cannot become an open redirect. */
export function safeNext(next: unknown, fallback = "/"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : fallback;
}
