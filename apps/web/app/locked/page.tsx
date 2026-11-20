import type { Metadata } from "next";
import { Mark } from "@/app/components/logo";
import { unlock } from "./actions";

export const metadata: Metadata = { title: "Private beta", robots: { index: false, follow: false } };

export default async function LockedPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { next, error } = await searchParams;
  return (
    <main className="lk">
      <form action={unlock} className="lk-card">
        <Mark size={44} />
        <h1>Hivetta is in private beta</h1>
        <p>Enter the access code you were given.</p>
        <input type="hidden" name="next" value={next ?? "/"} />
        <input name="code" autoFocus required autoComplete="off" spellCheck={false} placeholder="Access code" aria-label="Access code" aria-invalid={error ? true : undefined} />
        {error && <p className="lk-err" role="alert">That code isn’t right. Check it and try again.</p>}
        <button className="btn btn-primary btn-block">Enter</button>
      </form>
    </main>
  );
}
