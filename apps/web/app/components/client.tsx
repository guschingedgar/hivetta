"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/components/ui";
import { Words } from "@/app/landing/parts";

/** A link that marks itself current when the URL matches (exactly, or as a prefix). */
export function NavLink({
  href,
  exact = false,
  className = "nav-link",
  children,
}: {
  href: string;
  exact?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} className={className} aria-current={active ? "page" : undefined} data-active={active || undefined}>
      {children}
    </Link>
  );
}

export function CopyButton({ value, label = "Copy", quiet = false }: { value: string; label?: string; quiet?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={copied || quiet ? "btn btn-sm" : "btn btn-primary btn-sm"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // Clipboard blocked: the text stays selectable.
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

const PROJECT_PAGES: Record<string, string> = {
  "": "Overview",
  memory: "Memory",
  conflicts: "Needs you",
  handoffs: "Handovers",
  branches: "Drafts",
  team: "People",
};

/** The current project page's name, from the URL (the layout can't see which child page renders). */
export function ProjectPageTitle({ base }: { base: string }) {
  const path = usePathname();
  const rest = path.startsWith(base) ? path.slice(base.length).replace(/^\//, "").split("/")[0] ?? "" : "";
  return <Words key={rest} text={PROJECT_PAGES[rest] ?? "Overview"} />;
}

/** Waits (polling) until the user's AI has saved something, then celebrates. */
export function LiveCheck({ initiallyConnected, next }: { initiallyConnected: boolean; next: string }) {
  const [state, setState] = useState<{ connected: boolean; ai: string | null; text: string | null }>({ connected: initiallyConnected, ai: null, text: null });
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (state.connected) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch("/api/setup/status", { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (j.connected && !stop) { setState(j); setFresh(true); return; }
        }
      } catch { /* keep waiting */ }
      if (!stop) timer = setTimeout(tick, 3000);
    };
    timer = setTimeout(tick, 1500);
    return () => { stop = true; clearTimeout(timer); };
  }, [state.connected]);

  if (state.connected) {
    return (
      <div className="live live-ok" role="status">
        <span className="live-dot" />
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 650 }}>{fresh ? `It works! ${state.ai ?? "Your AI"} just saved to your team’s Hivetta.` : "Your AI is connected."}</p>
          {state.text && <p className="small" style={{ marginTop: 2 }}>“{state.text}”</p>}
        </div>
        <Link href={next} className="btn btn-primary btn-sm">Continue</Link>
      </div>
    );
  }
  return (
    <div className="live" role="status" aria-live="polite">
      <span className="live-dot pulse" />
      <div>
        <p style={{ fontWeight: 650 }}>Waiting for your AI…</p>
        <p className="small muted">This turns green by itself the moment your assistant saves its first memory.</p>
      </div>
    </div>
  );
}


/** Right-hand side panel over the page. Closes with the close button, the backdrop or Escape. */
export function DrawerShell({ closeHref, label, children }: { closeHref: string; label: string; children: React.ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.push(closeHref, { scroll: false }); };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [closeHref, router]);
  return (
    <div className="drawer-wrap">
      <Link href={closeHref} scroll={false} className="drawer-backdrop" aria-label="Close" tabIndex={-1} />
      <motion.div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="drawer"
        initial={reduce ? false : { x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="drawer-top">
          <span className="faint small">Memory</span>
          <Link href={closeHref} scroll={false} className="drawer-x" aria-label="Close"><Icon name="x" size={16} /></Link>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
