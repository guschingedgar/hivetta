import type { Metadata } from "next";
import { ConflictCard } from "@/app/components/conflict";
import { Flash } from "@/app/components/flash";
import { Empty, when } from "@/app/components/ui";
import { openConflicts, projectFor } from "@/lib/data";

export const metadata: Metadata = { title: "Needs you" };

export default async function ConflictsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const { store, project } = await projectFor(id);
  const [open, closed] = await Promise.all([openConflicts(id), store.listConflicts(id, "closed")]);
  const canDecide = project.role === "admin";

  return (
    <>
      <Flash error={error} notice={notice} />
      <div className="spread" style={{ marginBottom: 20 }}>
        <span />
        {!canDecide && <span className="chip">Only admins decide</span>}
      </div>

      {open.length === 0 ? (
        <div className="card">
          <Empty title="No conflicts">
            <p className="small">Everything in this project’s memory agrees. New contradictions will show up here.</p>
          </Empty>
        </div>
      ) : (
        open.map((c) => <ConflictCard key={c.id} c={c} projectId={id} canDecide={canDecide} />)
      )}

      {closed.length > 0 && (
        <section style={{ marginTop: 40 }} aria-labelledby="past-title">
          <h2 id="past-title" className="section-title">Decided</h2>
          <ul className="card list">
            {closed.map((c) => (
              <li key={c.id} className="claim" style={{ padding: "16px 22px" }}>
                <div className="spread">
                  <span className={`chip ${c.status === "dismissed" ? "chip-fact" : "chip-open"}`}>{c.status === "dismissed" ? "Both kept" : "One kept"}</span>
                  <span className="faint xs">{c.resolvedAt ? when(c.resolvedAt) : ""}</span>
                </div>
                <p className="claim-text small">
                  {c.claimA?.text ?? "…"} <span className="faint">vs</span> {c.claimB?.text ?? "…"}
                </p>
                {c.resolution && <p className="faint xs">“{c.resolution}”</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

    </>
  );
}
