import type { Metadata } from "next";
import { setName } from "@/app/actions";
import { Flash } from "@/app/components/flash";
import { Brand } from "@/app/components/ui";
import { myName } from "@/lib/data";
import { personName } from "@/lib/names";
import { requireSession, safeNext } from "@/lib/session";
import { NameField } from "./name-field";

export const metadata: Metadata = { title: "Your name" };

export default async function HelloPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { next: rawNext, error, edit } = await searchParams;
  const next = safeNext(rawNext, "/projects");
  const session = await requireSession(`/hello?next=${encodeURIComponent(next)}`);
  const current = await myName();
  const editing = Boolean(edit && current);

  return (
    <div className="auth">
      <div className="auth-card stack-lg hello-card">
        <Brand />
        <div>
          <h1>{editing ? <>Change your <em className="serif-em">name</em></> : <>What should we <em className="serif-em">call you?</em></>}</h1>
          <p className="muted small" style={{ marginTop: 6 }}>Your team sees this name on everything you save, in every AI.</p>
        </div>
        <Flash error={error} />
        <form action={setName} className="stack">
          <input type="hidden" name="next" value={next} />
          <NameField initial={current ?? session.signupName ?? personName(session.email)} />
          <button className="btn btn-primary btn-block" type="submit">{editing ? "Save" : "Continue"}</button>
        </form>
      </div>
    </div>
  );
}
