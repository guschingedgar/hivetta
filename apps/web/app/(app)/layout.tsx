import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/app/components/sidebar";
import { aiName, allOpenConflicts, myAutoSave, myName, myProjects, mySources, myWorkspaces, setupState } from "@/lib/data";
import { requireSession } from "@/lib/session";

const KNOWN_AIS = ["Claude", "ChatGPT"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("/projects");
  // Everyone picks a name once; it replaces their email across the app.
  const name = await myName();
  if (!name) redirect("/hello");
  const [workspaces, projects, conflicts, sources, setup, jar, autoSave] = await Promise.all([
    myWorkspaces(),
    myProjects(),
    allOpenConflicts(),
    mySources(),
    setupState(),
    cookies(),
    myAutoSave(),
  ]);

  const used = new Set(sources.map((s) => aiName(s.client)));
  const ais = [...KNOWN_AIS, ...[...used].filter((n) => !KNOWN_AIS.includes(n))].map((name) => ({ name, connected: used.has(name) }));
  const inboxCount = [...conflicts.values()].reduce((n, l) => n + l.length, 0);

  return (
    <div className="shell">
      <Sidebar
        email={session.email}
        name={name}
        workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, role: w.role }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name, workspaceId: p.workspaceId, conflicts: conflicts.get(p.id)?.length ?? 0 }))}
        preferredWorkspace={jar.get("cm_ws")?.value ?? null}
        inboxCount={inboxCount}
        setup={{ done: setup.done, total: setup.total }}
        ais={ais}
        autoSave={autoSave}
      />
      <main className="main">{children}</main>
    </div>
  );
}
