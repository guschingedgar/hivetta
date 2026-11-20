import type { Metadata } from "next";
import { setNewPassword } from "@/app/actions";
import { Flash } from "@/app/components/flash";
import { Brand } from "@/app/components/ui";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { error } = await searchParams;
  const session = await requireSession("/forgot");
  return (
    <div className="auth">
      <div className="auth-card stack-lg">
        <Brand />
        <div>
          <h1>Choose a new password</h1>
          <p className="muted small" style={{ marginTop: 6 }}>For {session.email}.</p>
        </div>
        <Flash error={error} />
        <form action={setNewPassword} className="stack">
          <label className="field">New password<input name="password" type="password" required minLength={8} autoComplete="new-password" autoFocus placeholder="At least 8 characters" /></label>
          <label className="field">Confirm it<input name="confirm_password" type="password" required minLength={8} autoComplete="new-password" /></label>
          <button className="btn btn-primary btn-block" type="submit">Save my new password</button>
        </form>
      </div>
    </div>
  );
}
