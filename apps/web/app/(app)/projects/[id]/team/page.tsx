import type { Metadata } from "next";
import type { ClaimView } from "@memory/schema";
import { MEMBER_ROLES } from "@memory/schema";
import { cancelInvitation, inviteMember, removeMember } from "@/app/actions";
import { KIND_COLORS } from "@/app/components/dash";
import { Flash } from "@/app/components/flash";
import { Icon, colorFor, when } from "@/app/components/ui";
import { Rise } from "@/app/landing/parts";
import { projectFor } from "@/lib/data";
import { aiName, personName } from "@/lib/names";

export const metadata: Metadata = { title: "People" };

const ROLES = {
  viewer: { label: "Viewer", icon: "eye", color: "var(--sky)", text: "Reads the memory, in the app and through their AI." },
  contributor: { label: "Contributor", icon: "pen", color: "var(--lilac)", text: "Also saves memories and handovers, and merges drafts." },
  admin: { label: "Admin", icon: "key", color: "var(--accent)", text: "Also settles conflicts, invites or removes people, and creates projects." },
} as const;

const KINDS = ["decision", "fact", "assumption", "open_question"] as const;

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const { session, store, project } = await projectFor(id);
  const isAdmin = project.role === "admin";
  const [members, invitations, claims] = await Promise.all([
    store.listMembers(project.workspaceId),
    isAdmin ? store.listInvitations(project.workspaceId) : Promise.resolve([]),
    store.listClaims(id, { limit: 500 }).catch(() => [] as ClaimView[]),
  ]);
  const names = await store.namesFor(members.map((m) => m.userId)).catch(() => new Map<string, string>());

  const byAuthor = new Map<string, ClaimView[]>();
  for (const c of claims) {
    const k = c.provenance.authorId ?? "";
    byAuthor.set(k, [...(byAuthor.get(k) ?? []), c]);
  }
  const people = members
    .map((m) => {
      const mine = byAuthor.get(m.userId) ?? [];
      return { ...m, name: names.get(m.userId) ?? personName(m.email), mine, ais: [...new Set(mine.map((c) => aiName(c.provenance.client)))] };
    })
    .sort((a, b) => b.mine.length - a.mine.length);

  return (
    <>
      <Flash error={error} notice={notice} />

      <div className="pg-intro">
        <p>Everyone in {project.workspaceName} sees every project in it. <b>Viewers</b> read, <b>contributors</b> also save and merge drafts, <b>admins</b> also settle conflicts and manage people.</p>
      </div>

      {isAdmin && (
        <form action={inviteMember} className="pp-invite-bar">
          <input type="hidden" name="project_id" value={id} />
          <input type="hidden" name="workspace_id" value={project.workspaceId} />
          <input name="email" type="email" placeholder="Invite by email: teammate@company.com" required aria-label="Email" />
          <select name="role" defaultValue="contributor" aria-label="Role">
            {MEMBER_ROLES.map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
          </select>
          <button className="btn btn-primary">Invite</button>
        </form>
      )}

      <div className="pg-col">
        <section aria-label="People" className="stack" style={{ gap: 28 }}>
          <div>
            <div className="sec-head"><h2>Members<span className="n">{members.length}</span></h2></div>
            <div className="pp-grid">
              {people.map((p, i) => {
                const role = ROLES[p.role];
                const last = p.mine[0];
                return (
                  <Rise key={p.userId} delay={0.04 * i} y={14}>
                    <article className="pp-card">
                      <div className="pp-top">
                        <span className="pp-face" style={{ background: colorFor(p.name) }}>{p.name[0]!.toUpperCase()}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <h3 title={p.name}>{p.name}</h3>
                          <p className="pp-email" title={p.email}>{p.email}</p>
                        </div>
                      </div>
                      <div className="pp-role">
                        <span className="kchip" style={{ color: role.color, background: `color-mix(in srgb, ${role.color} 12%, white)` }}><i />{role.label}</span>
                        {p.userId === session.userId && <span className="pp-you">You</span>}
                      </div>
                      <div className="pp-stats">
                        <span><b>{p.mine.length}</b> memor{p.mine.length === 1 ? "y" : "ies"}</span>
                        <span>{last ? `last saved ${when(last.provenance.recordedAt)}` : "nothing saved yet"}</span>
                        {p.ais.length > 0 && <span>in {p.ais.join(", ")}</span>}
                      </div>
                      {isAdmin && p.userId !== session.userId && (
                        <details className="pp-remove">
                          <summary>Remove access</summary>
                          <form action={removeMember} className="pp-confirm">
                            <input type="hidden" name="project_id" value={id} />
                            <input type="hidden" name="workspace_id" value={project.workspaceId} />
                            <input type="hidden" name="user_id" value={p.userId} />
                            <span>Remove {p.name} from {project.workspaceName}? They lose access to every project in it. What they saved stays.</span>
                            <button className="btn btn-danger btn-sm">Remove</button>
                          </form>
                        </details>
                      )}
                      {p.mine.length > 0 && (
                        <div className="kind-bar" aria-hidden>
                          {KINDS.map((k) => {
                            const n = p.mine.filter((c) => c.type === k).length;
                            return n > 0 ? <span key={k} style={{ flex: n, background: KIND_COLORS[k] }} /> : null;
                          })}
                        </div>
                      )}
                    </article>
                  </Rise>
                );
              })}
            </div>
          </div>

          {invitations.length > 0 && (
            <div>
              <div className="sec-head"><h2>Invited<span className="n">{invitations.length}</span></h2></div>
              <div className="pp-invites">
                {invitations.map((i) => (
                  <div key={i.email} className="pp-invite">
                    <span className="pp-face pending">?</span>
                    <span className="grow" style={{ minWidth: 0 }}><b>{i.email}</b><span className="faint xs"> · {ROLES[i.role].label} · invited {when(i.createdAt)}</span></span>
                    <span className="faint xs">joins when they sign up</span>
                    <form action={cancelInvitation}>
                      <input type="hidden" name="project_id" value={id} />
                      <input type="hidden" name="workspace_id" value={project.workspaceId} />
                      <input type="hidden" name="email" value={i.email} />
                      <button className="btn btn-sm" title={`Cancel the invitation for ${i.email}`}>Cancel</button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

      </div>
    </>
  );
}
