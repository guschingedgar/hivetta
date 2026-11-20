import type { Metadata } from "next";
import Link from "next/link";
import { CLAIM_TYPES, type ClaimStatus, type ClaimType, type ClaimView } from "@memory/schema";
import { searchMemory } from "@memory/retrieval";
import { reviewClaim } from "@/app/actions";
import { Flash } from "@/app/components/flash";
import { ClaimBody, Empty, Icon } from "@/app/components/ui";
import { MemoryDrawer, withMemory } from "@/app/components/memory-drawer";
import { openConflicts, projectFor } from "@/lib/data";
import { embedder } from "@/lib/mcp";

const TYPE_TABS: { key: string; label: string; types?: ClaimType[]; color?: string }[] = [
  { key: "all", label: "All" },
  { key: "decision", label: "Decisions", types: ["decision"], color: "var(--mint)" },
  { key: "fact", label: "Facts", types: ["fact"], color: "var(--sky)" },
  { key: "assumption", label: "Assumptions", types: ["assumption"], color: "var(--lilac)" },
  { key: "open_question", label: "Open questions", types: ["open_question"], color: "var(--rose)" },
];
export const metadata: Metadata = { title: "Memory" };

const HISTORY: ClaimStatus[] = ["superseded", "rejected", "retired"];

export default async function MemoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { store, project } = await projectFor(id);
  const q = (sp.q ?? "").trim().slice(0, 500);
  const typeTab = TYPE_TABS.find((t) => t.key === sp.type) ?? TYPE_TABS[0]!;
  const history = sp.view === "history";
  const statuses = history ? HISTORY : undefined;
  const isAdmin = project.role === "admin";
  const base = `/projects/${id}/memory`;
  const root = `/projects/${id}`;

  const href = (o: { type?: string; view?: string; q?: string }) => {
    const u = new URLSearchParams();
    const t = o.type ?? typeTab.key;
    const v = o.view ?? (history ? "history" : "live");
    const query = o.q ?? q;
    if (t !== "all") u.set("type", t);
    if (v === "history") u.set("view", "history");
    if (query) u.set("q", query);
    const s = u.toString();
    return s ? `${base}?${s}` : base;
  };

  let claims: ClaimView[];
  let degraded = false;
  if (q) {
    const r = await searchMemory(
      { store, embedder: embedder() },
      { project_id: id, query: q, filters: { types: typeTab.types, statuses }, limit: 30 },
    );
    claims = r.hits;
    degraded = r.degraded;
  } else {
    claims = await store.listClaims(id, { types: typeTab.types, statuses, limit: 200 });
  }
  const [conflicts, all] = await Promise.all([openConflicts(id), q || history || typeTab.types ? store.listClaims(id, { limit: 500 }) : Promise.resolve(claims)]);
  const inConflict = new Set(conflicts.flatMap((c) => [c.claimA?.id, c.claimB?.id]));
  const counts = Object.fromEntries(CLAIM_TYPES.map((t) => [t, all.filter((c) => c.type === t).length])) as Record<ClaimType, number>;
  const returnTo = href({});

  return (
    <>
    {sp.m && <MemoryDrawer projectId={id} claimId={sp.m} pageHref={returnTo} />}
    <>
      <Flash error={sp.error} notice={sp.notice} />
      {conflicts.length > 0 && (
        <Link href={`${root}/conflicts`} className="alert-sun">
          <span className="row"><Icon name="alert" size={16} />{conflicts.length === 1 ? "Two memories disagree. Pick the right one." : `${conflicts.length} pairs of memories disagree. Pick the right ones.`}</span>
          <span style={{ fontWeight: 600 }}>Review</span>
        </Link>
      )}

      <div className="pg-col">
        <section aria-label="Memory">
          <form className="search" action={base} role="search">
            {typeTab.key !== "all" && <input type="hidden" name="type" value={typeTab.key} />}
            {history && <input type="hidden" name="view" value="history" />}
            <label className="sr-only" htmlFor="q">Search this project’s memory</label>
            <input id="q" name="q" defaultValue={q} placeholder="Ask anything, e.g. “how do we take payments?”" />
            <button className="btn"><Icon name="search" size={14} />Search</button>
          </form>

          <div className="spread" style={{ marginBottom: 16 }}>
            <nav className="segmented" aria-label="Filter by kind">
              {TYPE_TABS.map((t) => (
                <Link key={t.key} href={href({ type: t.key })} aria-current={t.key === typeTab.key ? "page" : undefined}>
                  {t.color && <span className="dot" style={{ background: t.color }} />}{t.label}{counts[t.key as ClaimType] !== undefined && <span className="seg-n">{counts[t.key as ClaimType]}</span>}
                </Link>
              ))}
            </nav>
            <nav className="segmented" aria-label="Current or history">
              <Link href={href({ view: "live" })} aria-current={!history ? "page" : undefined}>Current</Link>
              <Link href={href({ view: "history" })} aria-current={history ? "page" : undefined}>History</Link>
            </nav>
          </div>

          {q && (
            <p className="small muted" style={{ marginBottom: 12 }}>
              {claims.length} result{claims.length === 1 ? "" : "s"} for “{q}”{degraded && " (matching words only: meaning search is unavailable right now)"} ·{" "}
              <Link href={href({ q: "" })} style={{ color: "var(--accent)" }}>clear</Link>
            </p>
          )}

          <div className="mem-wrap">
            {claims.length === 0 ? (
              q ? (
                <Empty title="Nothing found"><p className="small">Try other words, or another filter.</p></Empty>
              ) : history ? (
                <Empty title="No history yet"><p className="small">Replaced and set-aside memories show up here. Nothing is ever deleted.</p></Empty>
              ) : (
                <Empty title="This project’s memory is empty">
                  <p className="small">Connect your AI, then say “save what we decided to Hivetta” at the end of a conversation.</p>
                  <Link href="/connect" className="btn btn-primary">Connect your AI</Link>
                </Empty>
              )
            ) : (
              <ul className="mem-cards">
                {claims.map((c) => (
                  <li key={c.id} className="claim mem-card" data-type={c.type}>
                    <Link href={withMemory(returnTo, c.id)} scroll={false} className="mem-open" aria-label={`Details: ${c.text}`}>
                      <ClaimBody claim={c} />
                      <span className="open-hint">{c.rationale ? "Why and details" : "Details"} ›</span>
                    </Link>
                    {c.status === "proposed" && inConflict.has(c.id) && (
                      <p className="small" style={{ marginTop: 8 }}>
                        <Link href={`${root}/conflicts`} style={{ color: "var(--warn)" }}>In conflict with another memory → decide</Link>
                      </p>
                    )}
                    {c.status === "proposed" && !inConflict.has(c.id) && isAdmin && (
                      <form action={reviewClaim} className="row" style={{ marginTop: 10 }}>
                        <input type="hidden" name="project_id" value={id} />
                        <input type="hidden" name="claim_id" value={c.id} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <span className="faint xs">The AI checker couldn’t decide on this one.</span>
                        <button className="btn btn-sm btn-primary" name="decision" value="accepted">Accept</button>
                        <button className="btn btn-sm" name="decision" value="rejected">Set aside</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

      </div>
    </>
    </>
  );
}
