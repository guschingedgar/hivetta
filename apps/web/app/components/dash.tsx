import Link from "next/link";
import type { ClaimView } from "@memory/schema";
import { CountUp, Rise } from "@/app/landing/parts";
import { Icon, colorFor, when } from "@/app/components/ui";
import { aiName, personName } from "@/lib/names";

/* Dashboard building blocks: a card with a coloured header, KPI tiles, and two tiny charts
   drawn with plain HTML (no chart library). All server-rendered. */

export const KIND_COLORS = {
  decision: "var(--mint)",
  fact: "var(--sky)",
  assumption: "var(--lilac)",
  open_question: "var(--rose)",
} as const;
const KIND_ORDER = ["decision", "fact", "assumption", "open_question"] as const;
const KIND_NAMES = { decision: "Decisions", fact: "Facts", assumption: "Assumptions", open_question: "Open questions" } as const;

type IconName = Parameters<typeof Icon>[0]["name"];

/** A white card whose header is tinted with one colour, so each section is recognisable at a glance. */
export function KCard({ title, icon, color = "var(--accent)", href, linkLabel = "All", count, className, delay = 0, children }: {
  title: string; icon: IconName; color?: string; href?: string; linkLabel?: string; count?: number; className?: string; delay?: number; children: React.ReactNode;
}) {
  return (
    <Rise delay={delay} y={18} className={className}>
    <section className="kcard" style={{ "--k": color } as React.CSSProperties} aria-label={title}>
      <header className="kcard-h">
        <span className="ic"><Icon name={icon} size={14} /></span>
        <h2>{title}</h2>
        {count !== undefined && <span className="cnt">{count}</span>}
        {href && <Link href={href}>{linkLabel}</Link>}
      </header>
      {children}
    </section>
    </Rise>
  );
}

/** A memory as on the landing page: coloured strip, text, kind chip, who and which AI. */
export function MemCard({ c, href }: { c: ClaimView; href: string }) {
  const who = personName(c.provenance.author);
  const color = KIND_COLORS[c.type];
  return (
    <Link href={href} className="mcard" scroll={false}>
      <span className="bar" style={{ background: color }} />
      <span style={{ minWidth: 0 }}>
        <span className="t">{c.text}</span>
        <span className="m">
          <span className="kchip" style={{ color, background: `color-mix(in srgb, ${color} 13%, white)` }}><i />{KIND_ONE[c.type]}</span>
          <span className="who"><span className="face" style={{ background: colorFor(who) }}>{who[0]}</span>{who} in {aiName(c.provenance.client)}</span>
          <span>{when(c.provenance.recordedAt)}</span>
          {c.autoSaved && <span className="auto-chip" title="Your AI saved this on its own, with auto-save on">Auto</span>}
          {c.rationale && <span className="has-why">Why ›</span>}
        </span>
      </span>
    </Link>
  );
}
const KIND_ONE = { decision: "Decision", fact: "Fact", assumption: "Assumption", open_question: "Open question" } as const;

/** One big number with a label and an optional note underneath. */
export function Kpi({ label, value, prefix, note, color = "var(--accent)", icon, href, delay = 0 }: { label: string; value: number; prefix?: string; note?: string; color?: string; icon: IconName; href?: string; delay?: number }) {
  const body = (
    <>
      <span className="kpi-top"><span className="ic"><Icon name={icon} size={15} /></span>{label}</span>
      <span className="kpi-v">{prefix}<CountUp to={value} /></span>
      <span className="kpi-n">{note ?? " "}</span>
    </>
  );
  const style = { "--k": color } as React.CSSProperties;
  return <Rise delay={delay} y={16}>{href ? <Link href={href} className="kpi" style={style}>{body}</Link> : <div className="kpi" style={style}>{body}</div>}</Rise>;
}

/** Memories saved per day over the last `days` days, stacked by kind. */
export function ActivityChart({ claims, days = 14 }: { claims: ClaimView[]; days?: number }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - i));
    return { d, n: { decision: 0, fact: 0, assumption: 0, open_question: 0 } as Record<string, number>, total: 0 };
  });
  for (const c of claims) {
    const t = new Date(c.provenance.recordedAt);
    t.setHours(0, 0, 0, 0);
    const i = days - 1 - Math.round((today.getTime() - t.getTime()) / 86400000);
    if (i >= 0 && i < days) { buckets[i]!.n[c.type] = (buckets[i]!.n[c.type] ?? 0) + 1; buckets[i]!.total++; }
  }
  const max = Math.max(1, ...buckets.map((b) => b.total));
  const sum = buckets.reduce((n, b) => n + b.total, 0);
  const fmt = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });
  return (
    <div className="chart">
      <p className="chart-sum"><b>{sum}</b> saved in the last {days} days</p>
      <div className="bars" role="img" aria-label={`${sum} memories saved in the last ${days} days`}>
        {buckets.map((b, i) => (
          <div key={i} className="bar-col" title={`${fmt.format(b.d)}: ${b.total}`}>
            <div className="bar-stack" style={{ height: `${(b.total / max) * 100}%`, animationDelay: `${i * 40}ms` }}>
              {KIND_ORDER.map((k) => b.n[k]! > 0 && <span key={k} style={{ flex: b.n[k], background: KIND_COLORS[k] }} />)}
            </div>
            {b.total > 0 && <span className="bar-n">{b.total}</span>}
          </div>
        ))}
      </div>
      <div className="bar-axis"><span>{fmt.format(buckets[0]!.d)}</span><span>Today</span></div>
      <p className="legend">{KIND_ORDER.map((k) => <span key={k}><i style={{ background: KIND_COLORS[k] }} />{KIND_NAMES[k]}</span>)}</p>
    </div>
  );
}

/** Horizontal bars: a label, a bar, a number. */
export function Bars({ rows, color = "var(--accent)" }: { rows: { label: string; n: number; color?: string }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (rows.length === 0) return <p className="kempty">Nothing yet.</p>;
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.label} className="hbar">
          <span className="hl">{r.label}</span>
          <span className="ht"><span style={{ width: `${(r.n / max) * 100}%`, background: r.color ?? color }} /></span>
          <span className="hn">{r.n}</span>
        </div>
      ))}
    </div>
  );
}

/** Count items by a key, biggest first. */
export function tally<T>(items: T[], key: (t: T) => string, limit = 5) {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label, n]) => ({ label, n }));
}

export function sinceDays(claims: ClaimView[], days: number) {
  const cut = Date.now() - days * 86400000;
  return claims.filter((c) => new Date(c.provenance.recordedAt).getTime() >= cut).length;
}

const DISCOVER = [
  { icon: "search", color: "var(--sky)", title: "Ask in plain words", text: "Search by meaning, not exact words.", say: "Search Hivetta: how do we take payments?", href: (p: string) => `${p}/memory` },
  { icon: "alert", color: "var(--sun)", title: "Settle contradictions", text: "When two AIs disagree, you pick.", say: null, href: () => "/inbox" },
  { icon: "note", color: "var(--lilac)", title: "Write a handover", text: "Pass on where things stand, and why.", say: "Write a handover for Louis on where we are.", href: (p: string) => `${p}/handoffs` },
  { icon: "branch", color: "var(--rose)", title: "Try ideas in drafts", text: "Explore without touching the real memory.", say: "Save this to a draft called pricing ideas.", href: (p: string) => `${p}/branches` },
  { icon: "people", color: "var(--mint)", title: "Bring your team", text: "Everyone keeps their own AI.", say: null, href: (p: string) => `${p}/team` },
  { icon: "plug", color: "var(--accent)", title: "Add another AI", text: "Claude, ChatGPT, and any AI with connectors.", say: null, href: () => "/setup?step=connect" },
] as const;

/** Feature tiles that teach what the product can do, with a phrase to try. */
export function Discover({ projectBase }: { projectBase: string | null }) {
  const items = DISCOVER;
  return (
    <div className="discover">
      {items.map((d, i) => (
        <Rise key={d.title} delay={i * 0.05} y={16}>
          <Link href={projectBase ? d.href(projectBase) : d.href("/projects")} className="disc" style={{ "--k": d.color } as React.CSSProperties}>
            <span className="ic"><Icon name={d.icon} size={17} /></span>
            <span className="tt">{d.title}</span>
            <span className="tx">{d.text}</span>
            {d.say && <span className="say">“{d.say}”</span>}
          </Link>
        </Rise>
      ))}
    </div>
  );
}
