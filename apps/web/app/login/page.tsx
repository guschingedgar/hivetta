import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn, signUp } from "@/app/actions";
import { Flash } from "@/app/components/flash";
import { Brand } from "@/app/components/ui";
import { getSession, safeNext } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { next: rawNext, error, notice, mode } = await searchParams;
  const next = safeNext(rawNext, "/projects");
  if (await getSession().catch(() => null)) redirect(next);
  const signup = mode === "signup";
  const tab = (m: string) => `/login?mode=${m}&next=${encodeURIComponent(next)}`;
  const fromAssistant = next.startsWith("/oauth/");

  return (
    <div className="auth split">
      <div className="auth-main">
      <div className="auth-card stack-lg">
        <Brand />
        <div>
          <h1>{signup ? <>Create your <em className="serif-em">account</em></> : <>Welcome <em className="serif-em">back</em></>}</h1>
          <p className="muted small" style={{ marginTop: 6 }}>
            {fromAssistant
              ? "Sign in to let your AI assistant use your team’s Hivetta."
              : signup
                ? "Free while in beta. You can invite your team right after."
                : "Sign in to your team’s Hivetta."}
          </p>
        </div>

        <nav className="auth-switch" aria-label="Sign in or create an account">
          <Link href={tab("signin")} aria-current={!signup ? "page" : undefined}>Sign in</Link>
          <Link href={tab("signup")} aria-current={signup ? "page" : undefined}>Create account</Link>
        </nav>

        <Flash error={error} notice={notice} />

        {signup ? (
          <form action={signUp} className="stack">
            <input type="hidden" name="next" value={next} />
            <label className="field">Your name<input name="name" required maxLength={40} autoComplete="given-name" placeholder="How your team sees you, e.g. Edgar" /></label>
            <label className="field">Email<input name="email" type="email" required autoComplete="email" placeholder="you@company.com" /></label>
            <label className="field">Password<input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" /></label>
            <label className="field">Confirm password<input name="confirm_password" type="password" required minLength={8} autoComplete="new-password" /></label>
            <button className="btn btn-primary btn-block" type="submit">Create account</button>
            <p className="faint xs" style={{ textAlign: "center" }}>See <Link href="/data" style={{ textDecoration: "underline" }}>what we store</Link> before you start.</p>
          </form>
        ) : (
          <form action={signIn} className="stack">
            <input type="hidden" name="next" value={next} />
            <label className="field">Email<input name="email" type="email" required autoComplete="email" placeholder="you@company.com" /></label>
            <label className="field">Password<input name="password" type="password" required autoComplete="current-password" /></label>
            <button className="btn btn-primary btn-block" type="submit">Sign in</button>
            <p className="xs" style={{ textAlign: "center" }}><Link href="/forgot" className="auth-link">Forgot your password?</Link></p>
          </form>
        )}

      </div>
      </div>
      <AuthSide />
    </div>
  );
}

const SAMPLE = [
  { t: "Payments go through Stripe Checkout.", k: "Decision", c: "var(--mint)", who: "Edgar in Claude" },
  { t: "Launch is planned for 3 March.", k: "Fact", c: "var(--sky)", who: "Louis in ChatGPT" },
  { t: "Who signs off the pricing page?", k: "Open question", c: "var(--rose)", who: "Maya in ChatGPT" },
];

function AuthSide() {
  return (
    <aside className="auth-side" aria-hidden>
      <p className="mono-label">Shop relaunch · Hivetta</p>
      <h2>Decide once. <em className="serif-em">Every AI</em> on your team remembers.</h2>
      <div className="mem">
        {SAMPLE.map((m) => (
          <div key={m.t} className="mem-card">
            <span className="bar" style={{ background: m.c }} />
            <div><p>{m.t}</p><small><b style={{ color: m.c }}>{m.k}</b> · {m.who}</small></div>
          </div>
        ))}
      </div>
      <span className="hand">
        <svg width="48" height="34" viewBox="0 0 48 34" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M44 30 C30 30 14 22 8 6" /><path d="M2 14 L8 6 L15 13" /></svg>
        your team, in two minutes
      </span>
    </aside>
  );
}
