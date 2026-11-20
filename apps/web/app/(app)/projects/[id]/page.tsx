import type { Metadata } from "next";
import Link from "next/link";
import type { ClaimType } from "@memory/schema";
import { ActivityChart, Bars, KCard, Kpi, MemCard, sinceDays, tally } from "@/app/components/dash";
import { Flash } from "@/app/components/flash";
import { MemoryDrawer, withMemory } from "@/app/components/memory-drawer";
import { when } from "@/app/components/ui";
import { openConflicts, projectFor } from "@/lib/data";
import { aiName, personName } from "@/lib/names";

export const metadata: Metadata = { title: "Overview" };

const KINDS = [
  { t: "decision", label: "Decisions", color: "var(--mint)", icon: "check" },
  { t: "fact", label: "Facts", color: "var(--sky)", icon: "memory" },
  { t: "assumption", label: "Assumptions", color: "var(--lilac)", icon: "spark" },
  { t: "open_question", label: "Open questions", color: "var(--rose)", icon: "chat" },
] as const;


/** The project dashboard: numbers, activity, what needs a person, and the latest of each kind. */
export default async function OverviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const { error, notice, m } = await searchParams;
  const { store } = await projectFor(id);
  const base = `/projects/${id}`;
  const [claims, handoffs, conflicts] = await Promise.all([store.listClaims(id, { limit: 300 }), store.listHandoffs(id, 1), openConflicts(id)]);
  const live = claims.filter((c) => c.status === "accepted" || c.status === "proposed");
  const of = (t: ClaimType) => live.filter((c) => c.type === t);
  const handoff = handoffs[0];
  const empty = claims.length === 0 && !handoff;

  return (
    <>
      <Flash error={error} notice={notice} />
      {m && <MemoryDrawer projectId={id} claimId={m} pageHref={base} />}

      <div className="kpis pull">
        {KINDS.map((k, i) => {
          const week = sinceDays(of(k.t), 7);
          return <Kpi key={k.t} label={k.label} value={of(k.t).length} note={week > 0 ? `+${week} this week` : undefined} color={k.color} icon={k.icon} href={`${base}/memory?type=${k.t}`} delay={i * 0.06} />;
        })}
      </div>

      {empty ? (
        <KCard title="Get started" icon="rocket" className="dash-gap">
          <div style={{ padding: "36px 24px", textAlign: "center" }}>
            <p style={{ fontWeight: 600, fontSize: 20, fontFamily: "var(--display)" }}>Nothing saved yet</p>
            <p className="muted" style={{ marginTop: 6 }}>Tell your AI: “save what we decided to Hivetta”.</p>
            <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
              <Link href="/setup?step=connect" className="btn btn-primary">Connect your AI</Link>
              <Link href="/welcome" className="btn">See an example</Link>
            </div>
          </div>
        </KCard>
      ) : (
        <div className="dash">
          <KCard title="Activity" icon="spark" className="d8">
            <ActivityChart claims={live} />
          </KCard>

          <div className="d4 dash-stack">
            <KCard title="Needs you" icon="alert" color="var(--sun)" count={conflicts.length || undefined} href={conflicts.length ? `${base}/conflicts` : undefined} linkLabel="Decide">
              {conflicts.length === 0 ? (
                <p className="kempty ok">Nothing to decide.</p>
              ) : (
                <div className="rows">
                  {conflicts.slice(0, 2).map((c) => (
                    <Link key={c.id} href={`${base}/conflicts`} className="row-item">
                      <div className="grow"><p className="t" style={{ whiteSpace: "normal" }}>{c.claimA?.text ?? "…"} <span className="faint">vs</span> {c.claimB?.text ?? "…"}</p></div>
                    </Link>
                  ))}
                </div>
              )}
            </KCard>
            <KCard title="Last handover" icon="note" color="var(--lilac)" href={`${base}/handoffs`}>
              {handoff ? (
                <Link href={`${base}/handoffs`} className="row-item">
                  <div className="grow">
                    <p className="t" style={{ whiteSpace: "normal" }}>{handoff.title}</p>
                    <p className="m">{personName(handoff.provenance.author)} · {when(handoff.createdAt)}</p>
                  </div>
                </Link>
              ) : <p className="kempty">No handover yet.</p>}
            </KCard>
          </div>

          <KCard title="Latest decisions" icon="check" color="var(--mint)" href={`${base}/memory?type=decision`} className="d6">
            <div className="mcards">
              {of("decision").slice(0, 5).map((c) => <MemCard key={c.id} c={c} href={withMemory(base, c.id)} />)}
              {of("decision").length === 0 && <p className="kempty">No decisions yet.</p>}
            </div>
          </KCard>

          <KCard title="Still open" icon="chat" color="var(--rose)" href={`${base}/memory?type=open_question`} className="d6">
            <div className="mcards">
              {of("open_question").slice(0, 5).map((c) => <MemCard key={c.id} c={c} href={withMemory(base, c.id)} />)}
              {of("open_question").length === 0 && <p className="kempty">Nothing open.</p>}
            </div>
          </KCard>

        </div>
      )}

    </>
  );
}
