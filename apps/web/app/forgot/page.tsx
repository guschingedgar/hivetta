import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions";
import { Flash } from "@/app/components/flash";
import { Brand } from "@/app/components/ui";

export const metadata: Metadata = { title: "Forgot your password" };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { sent, email, error } = await searchParams;
  return (
    <div className="auth">
      <div className="auth-card stack-lg">
        <Brand />
        {sent ? (
          <div className="stack">
            <h1>Check your inbox</h1>
            <p className="muted">If an account exists for <b>{email}</b>, we’ve sent it a link to choose a new password. It comes from contact@hivetta.com and works for one hour. Check your spam folder if you don’t see it.</p>
            <p className="small"><Link href="/login" className="auth-link">Back to sign in</Link></p>
          </div>
        ) : (
          <>
            <div>
              <h1>Forgot your password?</h1>
              <p className="muted small" style={{ marginTop: 6 }}>Enter your email and we’ll send you a link to choose a new one.</p>
            </div>
            <Flash error={error} />
            <form action={requestPasswordReset} className="stack">
              <label className="field">Email<input name="email" type="email" required autoComplete="email" autoFocus placeholder="you@company.com" /></label>
              <button className="btn btn-primary btn-block" type="submit">Send the link</button>
              <p className="xs" style={{ textAlign: "center" }}><Link href="/login" className="auth-link">Back to sign in</Link></p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
