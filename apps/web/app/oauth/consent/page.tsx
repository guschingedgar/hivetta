import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { decideConsent } from "@/app/actions";
import { Flash } from "@/app/components/flash";
import { Brand } from "@/app/components/ui";
import { requireSession } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Allow access" };

function hostOf(uri: string): string {
  try { return new URL(uri).host; } catch { return uri; }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-card wide stack-lg">
        <Brand />
        {children}
      </div>
    </div>
  );
}

// The "authorization path" configured in Supabase (Authentication > OAuth
// Server). Supabase sends the user here with ?authorization_id= when an MCP
// client such as Claude or ChatGPT asks for access.
export default async function ConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { authorization_id: authorizationId, error } = await searchParams;
  if (!authorizationId) return <Shell><p className="flash flash-error">This link is missing its authorization request. Start again from your assistant.</p></Shell>;

  const session = await requireSession(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`);
  const supabase = await createSupabaseServerClient();
  const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (detailsError || !data) return <Shell><p className="flash flash-error">This request is invalid or has expired. Start again from your assistant.</p></Shell>;
  if ("redirect_url" in data) redirect(data.redirect_url); // already approved earlier

  return (
    <Shell>
      <div>
        <h1>Let {data.client.name} use your Hivetta?</h1>
        <p className="muted small" style={{ marginTop: 6 }}>It will act as <b style={{ color: "var(--text)" }}>{session.email}</b>.</p>
      </div>
      <Flash error={error} />
      <div className="grid-2">
        <div>
          <p className="small" style={{ fontWeight: 600, marginBottom: 8 }}>It can</p>
          <ul className="list-check small">
            <li>see the projects you’re in</li>
            <li>search and read their memory</li>
            <li>save new memories and handoffs under your name</li>
          </ul>
        </div>
        <div>
          <p className="small" style={{ fontWeight: 600, marginBottom: 8 }}>It can’t</p>
          <ul className="list-check list-cross small">
            <li>settle conflicts</li>
            <li>invite people or change roles</li>
            <li>delete anything</li>
          </ul>
        </div>
      </div>
      <p className="faint xs">After you allow it, you go back to <code>{hostOf(data.redirect_uri)}</code>.</p>
      <form action={decideConsent} className="row">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <button className="btn btn-primary" name="decision" value="approve">Allow</button>
        <button className="btn" name="decision" value="deny">Deny</button>
      </form>
    </Shell>
  );
}
