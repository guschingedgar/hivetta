import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ClaimView, HandoffView } from "@memory/schema";
import { ActivityChart, KCard, KIND_COLORS, Kpi, MemCard, sinceDays } from "@/app/components/dash";
import { Flash } from "@/app/components/flash";
import { Icon, initial, when } from "@/app/components/ui";
import { allOpenConflicts, myName, myProjects, mySources, myWorkspaces, setupState } from "@/lib/data";
import { aiName, personName } from "@/lib/names";
import { requireSession, storeFor } from "@/lib/session";

export const metadata: Metadata = { title: "Home" };

const KINDS = ["decision", "fact", "assumption", "open_question"] as const;

type Item =
  | { kind: "claim"; at: string; p: { id: string; name: string }; c: ClaimView }
  | { kind: "handoff"; at: string; p: { id: string; name: string }; h: HandoffView };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" }).format(new Date()));
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { error, notice } = await searchParams;
  const session = await requireSession("/projects");
  const store = storeFor(session);
  const [workspaces, projects, conflicts, setup, sources, name] = await Promise.all([myWorkspaces(), myProjects(), allOpenConflicts(), setupState(), mySources(), myName()]);
  if (workspaces.length === 0) redirect("/setup");

  const per = await Promise.all(
    projects.map(async (p) => ({
      p,
      claims: await store.listClaims(p.id, { limit: 300 }).catch(() => [] as ClaimView[]),
      handoffs: await store.listHandoffs(p.id, 3).catch(() => [] as HandoffView[]),
    })),
  );
  const live = per.flatMap((x) => x.claims.filter((c) => c.status === "accepted" || c.status === "proposed"));
  const needs = projects.flatMap((p) => (conflicts.get(p.id) ?? []).map((c) => ({ p, c })));
  const ais = new Set(sources.map((s) => aiName(s.client)));
  const week = sinceDays(live, 7);
  const feed: Item[] = per
    .flatMap(({ p, claims, handoffs }) => [
      ...claims.slice(0, 10).map((c) => ({ kind: "claim" as const, at: c.provenance.recordedAt, p, c })),
      ...handoffs.map((h) => ({ kind: "handoff" as const, at: h.createdAt, p, h })),
    ])
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);
  const next = setup.steps.find((s) => !s.done);
  const isAdmin = workspaces.some((w) => w.role === "admin");
  const first = (name ?? personName(session.email)).split(/[\s.]/)[0] || "there";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="crumb">Home</p>
          <h1>{greeting()}, {first[0]!.toUpperCase() + first.slice(1)}</h1>
        </div>
        {isAdmin && <Link href="/setup?step=project&new=1" className="btn btn-primary"><Icon name="plus" size={14} />New project</Link>}
      </div>
      <Flash error={error} notice={notice} />

      {next && (
        <Link href={`/setup?step=${next.key}`} className="notice dash-gap">
          <Icon name="rocket" size={16} />
          <span>Finish setting up: {next.title.toLowerCase()}</span>
          <span className="faint small" style={{ fontWeight: 500 }}>{setup.done} of {setup.total}</span>
          <span className="btn btn-primary btn-sm">Continue</span>
        </Link>
      )}

      <div className="kpis">
        <Kpi label="Memories" value={live.length} note={`in ${projects.length} project${projects.length === 1 ? "" : "s"}`} icon="memory" />
        <Kpi label="This week" value={week} prefix="+" note="new memories" icon="spark" color="var(--mint)" delay={0.04} />
        <Kpi label="Needs you" value={needs.length} note={needs.length === 0 ? "all clear" : "to decide"} icon="alert" color="var(--sun)" href="/inbox" delay={0.08} />
        <Kpi label="AIs connected" value={ais.size} note={ais.size ? [...ais].join(", ") : "none yet"} icon="plug" color="var(--lilac)" href="/setup?step=connect" delay={0.12} />
      </div>

      <div className="dash">
        <div className="d8 stack" style={{ gap: 16 }}>
          <KCard title="Latest" icon="chat" count={feed.length || undefined}>
            {feed.length === 0 ? (
              <p className="kempty">Nothing saved yet. Tell your AI: “save what we decided to Hivetta”.</p>
            ) : (
              <div className="mcards">
                {feed.map((f) =>
                  f.kind === "claim" ? (
                    <MemCard key={f.c.id} c={f.c} href={`/projects/${f.p.id}/memory?m=${f.c.id}`} />
                  ) : (
                    <Link key={f.h.id} href={`/projects/${f.p.id}/handoffs#h-${f.h.id}`} className="mcard">
                      <span className="bar" style={{ background: "var(--lilac)" }} />
                      <span style={{ minWidth: 0 }}>
                        <span className="t">{f.h.title}</span>
                        <span className="m"><span className="kchip" style={{ color: "var(--lilac)", background: "color-mix(in srgb, var(--lilac) 13%, white)" }}><i />Handover</span><span>{personName(f.h.provenance.author)} · {f.p.name}</span><span>{when(f.at)}</span></span>
                      </span>
                    </Link>
                  ),
                )}
              </div>
            )}
          </KCard>
          <KCard title="Activity" icon="spark" delay={0.05}>
            <ActivityChart claims={live} />
          </KCard>
        </div>

        <div className="d4 stack" style={{ gap: 16 }}>
          <KCard title="Needs you" icon="alert" color="var(--sun)" count={needs.length || undefined} href={needs.length ? "/inbox" : undefined} linkLabel="Decide" delay={0.04}>
            {needs.length === 0 ? (
              <p className="kempty ok">Nothing to decide right now.</p>
            ) : (
              <div className="rows">
                {needs.slice(0, 4).map(({ p, c }) => (
                  <Link key={c.id} href="/inbox" className="row-item">
                    <div className="grow">
                      <p className="t" style={{ whiteSpace: "normal" }}>{c.claimA?.text ?? "…"} <span className="faint">vs</span> {c.claimB?.text ?? "…"}</p>
                      <p className="m">{p.name} · {when(c.createdAt)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </KCard>

          <KCard title="Projects" icon="note" count={projects.length} delay={0.08}>
            <div className="plist">
              {per.map(({ p, claims }) => {
                const mine = claims.filter((c) => c.status === "accepted" || c.status === "proposed");
                const warn = conflicts.get(p.id)?.length ?? 0;
                return (
                  <Link key={p.id} href={`/projects/${p.id}`} className="plist-row">
                    <span className="letter">{initial(p.name)}</span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="nm">{p.name}</span>
                      <span className="kind-bar" aria-hidden>
                        {KINDS.map((k) => {
                          const n = mine.filter((c) => c.type === k).length;
                          return n > 0 ? <span key={k} style={{ flex: n, background: KIND_COLORS[k] }} /> : null;
                        })}
                        {mine.length === 0 && <span style={{ flex: 1, background: "var(--raised)" }} />}
                      </span>
                    </span>
                    {warn > 0 && <span className="count count-warn">{warn}</span>}
                    <span className="n">{mine.length >= 300 ? "300+" : mine.length}</span>
                  </Link>
                );
              })}
              {isAdmin && <Link href="/setup?step=project&new=1" className="plist-new"><Icon name="plus" size={13} />New project</Link>}
            </div>
          </KCard>

        </div>
      </div>
    </div>
  );
}
