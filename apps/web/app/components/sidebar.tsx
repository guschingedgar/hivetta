"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut, switchWorkspace } from "@/app/actions";
import { Mark } from "@/app/components/logo";
import { Avatar, Icon, colorFor, initial } from "@/app/components/ui";

export type SidebarProps = {
  email: string;
  name: string;
  workspaces: { id: string; name: string; role: string }[];
  projects: { id: string; name: string; workspaceId: string; conflicts: number }[];
  preferredWorkspace: string | null;
  inboxCount: number;
  setup: { done: number; total: number };
  ais: { name: string; connected: boolean }[];
  autoSave: "off" | "drafts" | "memory";
};

const PAGES = [
  { seg: "", label: "Overview", icon: "eye", sq: "sq-blue" },
  { seg: "memory", label: "Memory", icon: "memory", sq: "sq-mint" },
  { seg: "handoffs", label: "Handovers", icon: "note", sq: "sq-sun" },
  { seg: "branches", label: "Drafts", icon: "branch", sq: "sq-lilac" },
  { seg: "team", label: "People", icon: "people", sq: "sq-sky" },
] as const;

export function Sidebar({ email, name, workspaces, projects, preferredWorkspace, inboxCount, setup, ais, autoSave }: SidebarProps) {
  const path = usePathname();
  const activeProject = projects.find((p) => path === `/projects/${p.id}` || path.startsWith(`/projects/${p.id}/`));
  const wsId =
    activeProject?.workspaceId ??
    (workspaces.some((w) => w.id === preferredWorkspace) ? preferredWorkspace : null) ??
    workspaces[0]?.id ??
    null;
  const ws = workspaces.find((w) => w.id === wsId);
  const list = projects.filter((p) => p.workspaceId === wsId);

  // Projects open like folders. The one you are in is always open.
  const [open, setOpen] = useState<Set<string>>(() => new Set(activeProject ? [activeProject.id] : []));
  useEffect(() => {
    if (activeProject) setOpen((s) => (s.has(activeProject.id) ? s : new Set(s).add(activeProject.id)));
  }, [activeProject]);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Collapsed to icons only; remembered per browser.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("cm_sidebar") === "closed"); } catch { /* storage unavailable */ }
  }, []);
  const flip = () => setCollapsed((c) => {
    try { localStorage.setItem("cm_sidebar", c ? "open" : "closed"); } catch { /* ignore */ }
    return !c;
  });

  const is = (href: string, exact = false) => (exact ? path === href : path === href || path.startsWith(`${href}/`));

  return (
    <aside className="sidebar" aria-label="App" data-collapsed={collapsed || undefined}>
      <div className="side-top">
        <WorkspaceSwitcher current={ws} workspaces={workspaces} />
        <button type="button" className="side-toggle" onClick={flip} aria-label={collapsed ? "Open sidebar" : "Close sidebar"} title={collapsed ? "Open sidebar" : "Close sidebar"}>
          <Icon name="panel" size={16} />
        </button>
      </div>

      <nav aria-label="Main" className="side-main">
        <Item href="/projects" active={is("/projects", true)} icon="home" label="Home" sq="sq-blue" />
        <Item href="/inbox" active={is("/inbox")} icon="alert" label="Needs you" sq="sq-sun" badge={inboxCount > 0 ? inboxCount : undefined} warn />
        <Item href="/discover" active={is("/discover")} icon="spark" label="Discover" sq="sq-mint" />
        {setup.done < setup.total && (
          <Item href="/setup" active={is("/setup")} icon="rocket" label="Setup" sq="sq-lilac" extra={<span className="setup-ring" aria-label={`${setup.done} of ${setup.total} done`}><Ring done={setup.done} total={setup.total} />{setup.done}/{setup.total}</span>} />
        )}

        <div className="nav-label spread" style={{ paddingRight: 6 }}>
          <span>Projects</span>
          {ws?.role === "admin" && <Link href="/setup?step=project&new=1" className="nav-add" aria-label="New project" title="New project"><Icon name="plus" size={13} /></Link>}
        </div>
        {list.length === 0 && <p className="nav-empty">No projects here yet.</p>}
        {list.map((p) => {
          const isOpen = open.has(p.id);
          const base = `/projects/${p.id}`;
          return (
            <div key={p.id} className="proj-group" data-open={isOpen || undefined}>
              <div className={`nav-link proj-row${activeProject?.id === p.id ? " in" : ""}`}>
                <button type="button" className="chev" onClick={() => toggle(p.id)} aria-expanded={isOpen} aria-label={`${isOpen ? "Close" : "Open"} ${p.name}`}>
                  <Icon name="chevron" size={13} />
                </button>
                <Link href={base} className="proj-name" title={p.name} onClick={() => setOpen((s) => new Set(s).add(p.id))}>
                  <span className="proj-dot" aria-hidden style={{ background: colorFor(p.id) }}>{initial(p.name)}</span>
                  <span className="label">{p.name}</span>
                </Link>
                {p.conflicts > 0 && <span className="count count-warn" title="Needs you">{p.conflicts}</span>}
              </div>
              {isOpen && (
                <div className="proj-pages">
                  {PAGES.map((pg) => {
                    const href = pg.seg ? `${base}/${pg.seg}` : base;
                    return (
                      <Link key={pg.seg} href={href} className="nav-sub" aria-current={is(href, pg.seg === "") ? "page" : undefined}>
                        <span className={`sq xs ${pg.sq}`}><Icon name={pg.icon} size={12} /></span>{pg.label}
                      </Link>
                    );
                  })}
                  {p.conflicts > 0 && (
                    <Link href={`${base}/conflicts`} className="nav-sub warn" aria-current={is(`${base}/conflicts`) ? "page" : undefined}>
                      <span className="sq xs sq-sun"><Icon name="alert" size={12} /></span>Needs you<span className="count count-warn">{p.conflicts}</span>
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <p className="nav-label" style={{ paddingTop: 4 }}>Your AIs</p>
        {ais.map((a) => (
          <Link key={a.name} href={a.connected ? "/connect" : `/setup?step=connect&ai=${a.name.toLowerCase()}`} className="ai-row" title={`${a.name}: ${a.connected ? "connected" : "add"}`}>
            <span className={`ai-ic${a.connected ? " on" : ""}`} aria-hidden>{a.name[0]}</span>{!AI_DOMAIN[a.name] && <span className={`ai-dot${a.connected ? " on" : ""}`} aria-hidden />}{AI_DOMAIN[a.name] && <img className={`ai-logo${a.connected ? " on" : ""}`} src={`https://www.google.com/s2/favicons?domain=${AI_DOMAIN[a.name]}&sz=32`} alt="" width={16} height={16} />}
            <span style={{ flex: 1 }}>{a.name}</span>
            <span className="faint xs">{a.connected ? "connected" : "add"}</span>
          </Link>
        ))}
        <Link href="/connect#auto-save" className="ai-row auto-row" title="Change auto-save">
          <span className={`ai-dot${autoSave !== "off" ? " on" : ""}`} aria-hidden />
          <span style={{ flex: 1 }}>Auto-save</span>
          <span className="faint xs">{autoSave === "off" ? "off" : autoSave === "drafts" ? "to drafts" : "to memory"}</span>
        </Link>
        <div className="row me-row">
          <Link href="/hello?edit=1" className="me-link" title={`${name} · ${email} · change your name`}>
            <Avatar name={name} />
            <span className="me-text"><b>{name}</b><span className="me-email">{email}</span></span>
          </Link>
          <form action={signOut}>
            <button className="btn btn-sm" title="Sign out" aria-label="Sign out"><Icon name="out" size={14} /></button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function Item({ href, active, icon, label, sq, badge, warn, extra }: { href: string; active: boolean; icon: Parameters<typeof Icon>[0]["name"]; label: string; sq: string; badge?: number; warn?: boolean; extra?: React.ReactNode }) {
  return (
    <Link href={href} className="nav-link" title={label} aria-current={active ? "page" : undefined}>
      <span className={`sq sm ${sq}`}><Icon name={icon} size={14} /></span>
      <span className="label">{label}</span>
      {badge !== undefined && <span className={`count${warn ? " count-warn" : ""}`}>{badge}</span>}
      {extra}
    </Link>
  );
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 6, c = 2 * Math.PI * r;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r={r} fill="none" stroke="var(--line-strong)" strokeWidth="2.4" />
      <circle cx="8" cy="8" r={r} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeDasharray={`${(done / total) * c} ${c}`} strokeLinecap="round" transform="rotate(-90 8 8)" />
    </svg>
  );
}

const AI_DOMAIN: Record<string, string> = { Claude: "claude.ai", ChatGPT: "chatgpt.com" };

function WorkspaceSwitcher({ current, workspaces }: { current?: { id: string; name: string; role: string }; workspaces: SidebarProps["workspaces"] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  if (!current) {
    return <Link href="/setup?step=workspace" className="ws-switch"><span className="ws-badge">+</span><span className="ws-name">Create a workspace</span></Link>;
  }
  return (
    <details ref={ref} className="ws-menu">
      <summary className="ws-switch">
        <span className="ws-badge ws-logo"><Mark size={22} /></span>
        <span className="ws-name"><span className="ws-k">Workspace</span>{current.name}</span>
        <Icon name="updown" size={14} />
      </summary>
      <div className="ws-pop">
        <p className="nav-label" style={{ padding: "4px 8px 6px" }}>Switch workspace</p>
        {workspaces.map((w) => (
          <form key={w.id} action={switchWorkspace}>
            <input type="hidden" name="workspace_id" value={w.id} />
            <button className="ws-opt" aria-current={w.id === current.id ? "true" : undefined}>
              <span className="ws-badge sm" style={{ background: colorFor(w.id) }}>{initial(w.name)}</span>
              <span style={{ flex: 1, textAlign: "left" }}>{w.name}</span>
              {w.id === current.id && <Icon name="check" size={14} />}
            </button>
          </form>
        ))}
        <div className="ws-sep" />
        {current.role === "admin" && <Link href={`/setup?step=invite`} className="ws-opt"><Icon name="people" size={14} />Invite people</Link>}
        <Link href="/setup?step=workspace&new=1" className="ws-opt"><Icon name="plus" size={14} />New workspace</Link>
      </div>
    </details>
  );
}
