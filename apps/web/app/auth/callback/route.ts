import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Landing point for email links. `code` (PKCE) works in the browser that asked; `token_hash` works on any
// device, which is what the Hivetta email templates use.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), "/projects");

  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const supabase = await createSupabaseServerClient();
  if (tokenHash && (type === "signup" || type === "recovery" || type === "email" || type === "email_change" || type === "invite" || type === "magiclink")) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    const to = type === "recovery" ? "/reset" : next;
    if (!error) return NextResponse.redirect(new URL(to, url.origin));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent("That sign-in link is invalid or has expired.")}`, url.origin));
}
