import { aiName, personName } from "@/lib/names";
import Link from "next/link";
import { Mark } from "@/app/components/logo";
import type { ClaimView } from "@memory/schema";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand">
      <Mark size={28} />
      Hivetta
    </Link>
  );
}

const TYPE_LABEL: Record<ClaimView["type"], string> = {
  decision: "Decision",
  fact: "Fact",
  assumption: "Assumption",
  open_question: "Open question",
};

export function TypeChip({ type }: { type: ClaimView["type"] }) {
  return (
    <span className={`chip chip-${type}`}>
      <span className="dot" />
      {TYPE_LABEL[type]}
    </span>
  );
}

const STATUS_LABEL: Record<ClaimView["status"], string> = {
  proposed: "Waiting for review",
  accepted: "Accepted",
  rejected: "Set aside",
  superseded: "Replaced",
  retired: "Retired",
};

export function StatusChip({ status }: { status: ClaimView["status"] }) {
  return <span className={`chip chip-${status}`}>{STATUS_LABEL[status]}</span>;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "3 hours ago", "yesterday", then a date. Rendered on the server, so relative to request time. */
export function when(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return dateFmt.format(new Date(iso));
}

/** Who saved it, with which AI, and when. The full details stay in a tooltip. */
export function Provenance({ p, at }: { p: { author: string; model: string; client: string }; at: string }) {
  const who = personName(p.author);
  return (
    <p className="prov" title={`${p.author} · ${p.model} via ${p.client} · ${at}`}>
      <span className="face" style={{ background: colorFor(who) }}>{initial(who)}</span>
      <span><b>{who}</b></span>
      <span>{aiName(p.client)}</span>
      <span>{when(at)}</span>
    </p>
  );
}

export function ClaimBody({ claim, showStatus = true }: { claim: ClaimView; showStatus?: boolean }) {
  return (
    <>
      <div className="row">
        <TypeChip type={claim.type} />
        {showStatus && claim.status !== "accepted" && <StatusChip status={claim.status} />}
      </div>
      <p className="claim-text">{claim.text}</p>
      <Provenance p={claim.provenance} at={claim.provenance.recordedAt} />
    </>
  );
}

const PALETTE = ["#8fbfa9", "#9db4cc", "#c9a3c6", "#e09a83", "#e2b25a", "#a9c9c0"];

/** A stable colour for a name (projects, people), so the same thing always looks the same. */
export function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function initial(text: string): string {
  return (text.trim()[0] ?? "?").toUpperCase();
}

export function Avatar({ name, size }: { name: string; size?: number }) {
  return (
    <span className="avatar" aria-hidden style={{ background: colorFor(name), ...(size ? { width: size, height: size } : {}) }}>
      {initial(name)}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-art" aria-hidden>
        <i style={{ background: "var(--mint)" }} /><i style={{ background: "var(--sky)" }} /><i style={{ background: "var(--lilac)" }} /><i style={{ background: "var(--rose)" }} />
      </div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/** Small inline icons (stroke = currentColor). */
export function Icon({ name, size = 16 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

const PATHS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11h14V9" /></>,
  plug: <><path d="M9 7V3M15 7V3" /><path d="M6 7h12v4a6 6 0 0 1-12 0V7Z" /><path d="M12 17v4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  out: <><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  memory: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></>,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
  note: <><path d="M5 3h10l4 4v14H5z" /><path d="M9 12h6M9 16h4" /></>,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="9" r="2" /><path d="M6 7v10M18 11c0 4-6 3-12 6" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  pen: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4V5Z" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  panel: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  x: <><path d="M6 6l12 12M18 6 6 18" /></>,
  updown: <><path d="m8 9 4-4 4 4" /><path d="m8 15 4 4 4-4" /></>,
  rocket: <><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" /><path d="M9 15l-3-3c1-4 4.5-8.5 13-9-.5 8.5-5 12-9 13l-1-1Z" /><circle cx="15" cy="9" r="1.6" /></>,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  spark: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></>,
} as const;
