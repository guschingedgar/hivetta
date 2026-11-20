import { notFound } from "next/navigation";
import { cache } from "react";
import { StoreError } from "@memory/store";
import { requireSession, storeFor } from "@/lib/session";

// Per-request memoised reads shared by layouts and pages (no cross-request caching:
// every read runs as the signed-in user, under RLS).

export const myProjects = cache(async () => {
  const store = storeFor(await requireSession("/projects"));
  return store.listProjects();
});

export const myWorkspaces = cache(async () => {
  const store = storeFor(await requireSession("/projects"));
  return store.listWorkspaces();
});

export const projectFor = cache(async (id: string) => {
  const session = await requireSession(`/projects/${id}`);
  const store = storeFor(session);
  const project = await store.getProject(id).catch((err) => {
    if (err instanceof StoreError && (err.code === "not_found" || err.code === "forbidden" || err.code === "invalid")) notFound();
    throw err;
  });
  return { session, store, project };
});

export const openConflicts = cache(async (id: string) => {
  const { store } = await projectFor(id);
  return store.listConflicts(id, "open");
});

/** What the signed-in user has saved from: which assistants are "connected" in practice. */
export const mySources = cache(async () => {
  const store = storeFor(await requireSession("/projects"));
  return store.listMySources(200).catch(() => []);
});

/**
 * The signed-in person's display name. If they typed one at sign-up but have no
 * profile yet (first visit after confirming their email), it is saved now.
 */
export const myName = cache(async (): Promise<string | null> => {
  const session = await requireSession("/projects");
  const store = storeFor(session);
  const name = await store.getMyName().catch(() => null);
  if (name || !session.signupName) return name;
  try {
    await store.setMyName(session.signupName);
    return session.signupName;
  } catch {
    return null;
  }
});

/** The signed-in person's auto-save setting. */
export const myAutoSave = cache(async () => {
  const session = await requireSession("/projects");
  return storeFor(session).getAutoSave().catch(() => "off" as const);
});

export { aiName } from "./names";

/** Open conflicts for every project the user can see, keyed by project id. */
export const allOpenConflicts = cache(async () => {
  const projects = await myProjects();
  const lists = await Promise.all(projects.map((p) => openConflicts(p.id).catch(() => [])));
  return new Map(projects.map((p, i) => [p.id, lists[i]!]));
});

/** Setup progress, computed from what exists. */
export const setupState = cache(async () => {
  const session = await requireSession("/projects");
  const store = storeFor(session);
  const [workspaces, projects, sources] = await Promise.all([myWorkspaces(), myProjects(), mySources()]);
  const adminOf = workspaces.filter((w) => w.role === "admin");
  const hasTeammate =
    workspaces.some((w) => w.role !== "admin") ||
    (await Promise.all(adminOf.slice(0, 6).map(async (w) => {
      const [m, i] = await Promise.all([store.listMembers(w.id).catch(() => []), store.listInvitations(w.id).catch(() => [])]);
      return m.length + i.length > 1;
    }))).some(Boolean);
  const steps = [
    { key: "workspace", done: workspaces.length > 0, title: "Name your workspace" },
    { key: "project", done: projects.length > 0, title: "Create your first project" },
    { key: "connect", done: sources.length > 0, title: "Connect your AI" },
    { key: "invite", done: hasTeammate, title: "Invite your team" },
  ] as const;
  return { steps, done: steps.filter((s) => s.done).length, total: steps.length, next: steps.find((s) => !s.done)?.key ?? null };
});
