import Link from "next/link";
import type { ClaimView } from "@memory/schema";
import type { ClaimDetail } from "@memory/store";
import { DrawerShell } from "@/app/components/client";
import { KIND_COLORS } from "@/app/components/dash";
import { Icon, colorFor, when } from "@/app/components/ui";
import { aiName, personName } from "@/lib/names";
import { storeFor, requireSession } from "@/lib/session";

const KIND = { decision: "Decision", fact: "Fact", assumption: "Assumption", open_question: "Open question" } as const;
const STATUS: Record<string, { label: string; color: string }> = {
  accepted: { label: "In memory", color: "var(--mint)" },
  proposed: { label: "Waiting for a decision", color: "var(--sun)" },
  rejected: { label: "Set aside", color: "var(--faint)" },
  superseded: { label: "Replaced", color: "var(--faint)" },
  retired: { label: "Retired", color: "var(--faint)" },
};
const LINK_LABEL: Record<string, [string, string]> = {
  // [when this memory is the "from" side, when it is the "to" side]
  supersedes: ["Replaces", "Replaced by"],
  duplicates: ["Repeats", "Repeated by"],
  contradicts: ["Contradicts", "Contradicted by"],
  supports: ["Supports", "Supported by"],
  refines: ["Refines", "Refined by"],
};

/** Adds ?m=<id> to a page URL, keeping its other parameters. */
export function withMemory(pageHref: string, id: string) {
  return `${pageHref}${pageHref.includes("?") ? "&" : "?"}m=${id}`;
}

/** The side panel for one memory. `pageHref` is the page underneath, without ?m. */
export async function MemoryDrawer({ projectId, claimId, pageHref }: { projectId: string; claimId: string; pageHref: string }) {
  const store = storeFor(await requireSession(pageHref));
  const d = await store.getClaimDetail(projectId, claimId).catch(() => null);
  return (
    <DrawerShell closeHref={pageHref} label={d ? d.claim.text : "Memory"}>
      {d ? <Detail d={d} pageHref={pageHref} /> : <p className="muted" style={{ padding: 28 }}>This memory doesn’t exist or you can’t see it.</p>}
    </DrawerShell>
  );
}

function Mini({ c, pageHref }: { c: ClaimView; pageHref: string }) {
  return (
    <Link href={withMemory(pageHref, c.id)} className="dmini" scroll={false}>
      <span className="bar" style={{ background: KIND_COLORS[c.type] }} />
      <span style={{ minWidth: 0 }}>
        <span className="t">{c.text}</span>
        <span className="m">{KIND[c.type]} · {personName(c.provenance.author)} · {when(c.provenance.recordedAt)}</span>
      </span>
    </Link>
  );
}

function Detail({ d, pageHref }: { d: ClaimDetail; pageHref: string }) {
  const c = d.claim;
  const color = KIND_COLORS[c.type];
  const who = personName(c.provenance.author);
  const status = STATUS[c.status] ?? STATUS.accepted!;
  const replacedBy = d.links.find((l) => l.type === "supersedes" && l.direction === "in");

  type Ev = { at: string; icon: Parameters<typeof Icon>[0]["name"]; color: string; title: React.ReactNode; body?: React.ReactNode };
  const events: Ev[] = [
    { at: c.provenance.recordedAt, icon: "plus", color: "var(--accent)", title: <>{c.autoSaved ? "Saved automatically" : "Saved"} by <b>{who}</b> in {aiName(c.provenance.client)}</>, body: <span className="faint">Model: {c.provenance.model}</span> },
  ];
  if (d.check) {
    const v = d.check.verdict;
    events.push({
      at: d.check.createdAt,
      icon: v === "new" ? "check" : "alert",
      color: v === "new" ? "var(--mint)" : v === "duplicate" ? "var(--faint)" : "var(--sun)",
      title: v === "new" ? "AI checker: new information, added" : v === "duplicate" ? "AI checker: already in memory" : "AI checker: contradicts another memory",
      body: d.check.reason,
    });
  }
  for (const k of d.conflicts.filter((k) => k.status !== "open")) {
    events.push({ at: k.resolvedAt ?? k.createdAt, icon: "people", color: "var(--lilac)", title: k.status === "dismissed" ? "A teammate kept both as true" : "A teammate settled the conflict", body: k.resolution ?? undefined });
  }
  if (replacedBy) {
    events.push({ at: replacedBy.createdAt, icon: "arrow", color: "var(--faint)", title: "Replaced by a newer memory", body: replacedBy.reason });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="drawer-body">
      <div className="d-head">
        <div className="row" style={{ gap: 8 }}>
          <span className="kchip" style={{ color, background: `color-mix(in srgb, ${color} 13%, white)` }}><i />{KIND[c.type]}</span>
          <span className="kchip" style={{ color: status.color, background: `color-mix(in srgb, ${status.color} 12%, white)` }}><i />{status.label}</span>
        </div>
        <h2 className="d-title">{c.text}</h2>
        <p className="d-who">
          <span className="face" style={{ background: colorFor(who) }}>{who[0]}</span>
          <b>{who}</b> in {aiName(c.provenance.client)} · {when(c.provenance.recordedAt)}
          {c.autoSaved && <span className="auto-chip">Saved automatically</span>}
        </p>
      </div>

      {replacedBy?.other && (
        <div className="d-sec">
          <p className="d-note"><Icon name="alert" size={14} />This was replaced. The current version:</p>
          <Mini c={replacedBy.other} pageHref={pageHref} />
        </div>
      )}

      <div className="d-sec">
        <h3><span className="ic" style={{ background: color }}><Icon name="spark" size={13} /></span>Why</h3>
        {c.rationale ? <p className="d-text">{c.rationale}</p> : <p className="d-empty">No reasoning was saved with this memory. New memories include it automatically.</p>}
      </div>

      {c.details && (
        <div className="d-sec">
          <h3><span className="ic" style={{ background: "var(--sky)" }}><Icon name="note" size={13} /></span>Details</h3>
          <p className="d-text">{c.details}</p>
        </div>
      )}

      {c.links && c.links.length > 0 && (
        <div className="d-sec">
          <h3><span className="ic" style={{ background: "var(--lilac)" }}><Icon name="arrow" size={13} /></span>Sources</h3>
          <ul className="d-links">
            {c.links.map((u) => (
              <li key={u}><a href={u} target="_blank" rel="noopener noreferrer nofollow">{u.replace(/^https?:\/\//, "")}</a></li>
            ))}
          </ul>
        </div>
      )}

      {d.savedWith.length > 0 && (
        <div className="d-sec">
          <h3><span className="ic" style={{ background: "var(--mint)" }}><Icon name="memory" size={13} /></span>Saved in the same conversation</h3>
          <div className="dminis">{d.savedWith.map((s) => <Mini key={s.id} c={s} pageHref={pageHref} />)}</div>
        </div>
      )}

      {(d.links.filter((l) => l !== replacedBy).length > 0 || d.conflicts.some((k) => k.status === "open")) && (
        <div className="d-sec">
          <h3><span className="ic" style={{ background: "var(--sun)" }}><Icon name="branch" size={13} /></span>Related</h3>
          {d.conflicts.filter((k) => k.status === "open").map((k) => (
            <Link key={k.id} href={`/projects/${c.projectId}/conflicts`} className="d-alert">
              <Icon name="alert" size={14} />Disagrees with another memory. A person needs to decide.<span>Decide</span>
            </Link>
          ))}
          <div className="dminis">
            {d.links.filter((l) => l !== replacedBy && l.other).map((l, i) => (
              <div key={i}>
                <p className="d-rel">{(LINK_LABEL[l.type] ?? [l.type, l.type])[l.direction === "out" ? 0 : 1]}</p>
                <Mini c={l.other!} pageHref={pageHref} />
              </div>
            ))}
          </div>
        </div>
      )}

      {d.handoff && (
        <div className="d-sec">
          <h3><span className="ic" style={{ background: "var(--lilac)" }}><Icon name="note" size={13} /></span>Part of a handover</h3>
          <Link href={`/projects/${c.projectId}/handoffs#h-${d.handoff.id}`} className="dmini">
            <span className="bar" style={{ background: "var(--lilac)" }} />
            <span><span className="t">{d.handoff.title}</span><span className="m">{personName(d.handoff.provenance.author)} · {when(d.handoff.createdAt)}</span></span>
          </Link>
        </div>
      )}

      <div className="d-sec">
        <h3><span className="ic" style={{ background: "var(--text)" }}><Icon name="clock" size={13} /></span>Timeline</h3>
        <ol className="d-time">
          {events.map((e, i) => (
            <li key={i}>
              <span className="dot" style={{ background: e.color }}><Icon name={e.icon} size={11} /></span>
              <div>
                <p className="tt"><span>{e.title}</span><span className="when">{when(e.at)}</span></p>
                {e.body && <p className="tb">{e.body}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
