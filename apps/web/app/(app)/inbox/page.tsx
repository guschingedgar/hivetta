import type { Metadata } from "next";
import Link from "next/link";
import { ConflictCard } from "@/app/components/conflict";
import { Flash } from "@/app/components/flash";
import { Empty, colorFor, initial } from "@/app/components/ui";
import { allOpenConflicts, myProjects } from "@/lib/data";

export const metadata: Metadata = { title: "Needs you" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { error, notice } = await searchParams;
  const [projects, conflicts] = await Promise.all([myProjects(), allOpenConflicts()]);
  const groups = projects.map((p) => ({ p, list: conflicts.get(p.id) ?? [] })).filter((g) => g.list.length > 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="crumb">All projects</p>
          <h1>Needs you</h1>
          <p className="muted" style={{ maxWidth: 640 }}>
            When two memories disagree, the AI checker stops and asks a person. Pick the one that’s true now: the other is kept as
            history, never deleted.
          </p>
        </div>
      </div>
      <Flash error={error} notice={notice} />

      {groups.length === 0 ? (
        <div className="card">
          <Empty title="All clear">
            <p className="small">Nothing needs a decision. New contradictions from any project will show up here.</p>
          </Empty>
        </div>
      ) : (
        <div className="stack-lg">
          {groups.map(({ p, list }) => (
            <section key={p.id} aria-label={p.name}>
              <Link href={`/projects/${p.id}`} className="group-head">
                <span className="proj-dot" aria-hidden style={{ background: colorFor(p.id) }}>{initial(p.name)}</span>
                {p.name}<span className="count count-warn">{list.length}</span>
              </Link>
              {list.map((c) => <ConflictCard key={c.id} c={c} projectId={p.id} canDecide={p.role === "admin"} returnTo="/inbox" />)}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
