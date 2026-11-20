import type { Metadata } from "next";
import type { BranchView, ClaimView } from "@memory/schema";
import { abandonBranch, mergeBranch } from "@/app/actions";
import { CopyButton } from "@/app/components/client";
import { KIND_COLORS } from "@/app/components/dash";
import { Flash } from "@/app/components/flash";
import { Icon, colorFor, when } from "@/app/components/ui";
import { Rise } from "@/app/landing/parts";
import { projectFor } from "@/lib/data";
import { aiName, personName } from "@/lib/names";

export const metadata: Metadata = { title: "Drafts" };

const SAY = "Save this as drafts in a branch called pricing-ideas.";
const KIND = { decision: "Decision", fact: "Fact", assumption: "Assumption", open_question: "Open question" } as const;

export default async function BranchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const { store, project } = await projectFor(id);
  const branches = await store.listBranches(id);
  const open = branches.filter((b) => b.status === "open");
  const closed = branches.filter((b) => b.status !== "open");
  const drafts = new Map(
    await Promise.all(open.map(async (b) => [b.id, await store.getBranchClaims(id, { name: b.name })] as const)),
  );
  const canMerge = project.role !== "viewer";

  return (
    <>
      <Flash error={error} notice={notice} />

      <div className="pg-intro">
        <p>Ideas saved as drafts stay out of the team’s searches until someone merges them. Merging sends each one through the AI checker.</p>
        <div className="pg-say"><span>Try:</span><span className="say">“{SAY}”</span><CopyButton value={SAY} quiet /></div>
      </div>

      <div className="pg-col">
        <section aria-label="Drafts" className="stack" style={{ gap: 28 }}>
          <div>
            <div className="sec-head"><h2>In progress<span className="n">{open.length}</span></h2></div>
            {open.length === 0 ? (
              <p className="pg-empty">Nothing in progress. Your AI creates a draft space when you ask it to, or when auto-save is set to drafts.</p>
            ) : (
              <div className="stack" style={{ gap: 14 }}>
                {open.map((b, i) => (
                  <Rise key={b.id} delay={0.05 * i} y={12}>
                    <OpenBranch b={b} list={drafts.get(b.id) ?? []} projectId={id} canMerge={canMerge} />
                  </Rise>
                ))}
              </div>
            )}
          </div>

          {closed.length > 0 && (
            <div>
              <div className="sec-head"><h2>Closed<span className="n">{closed.length}</span></h2></div>
              <div className="rlist">
                {closed.map((b) => (
                  <div key={b.id} className="rlist-row">
                    <span className="rl-main"><b>{b.name}</b></span>
                    <span className={`rl-status ${b.status}`}>{b.status === "merged" ? "Merged" : "Abandoned"}</span>
                    <span className="rl-meta">{b.drafts} draft{b.drafts === 1 ? "" : "s"}</span>
                    <span className="rl-meta">{b.closedAt ? when(b.closedAt) : ""}</span>
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

function OpenBranch({ b, list, projectId, canMerge }: { b: BranchView; list: ClaimView[]; projectId: string; canMerge: boolean }) {
  return (
    <article className="ho-card br-card">
      <div className="ho-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>{b.name}</h3>
          <p className="ho-meta">
            {b.name.startsWith("auto/") && <span className="auto-chip">Auto-saved by your AI</span>}
            <span>opened {when(b.createdAt)}</span>
            <span>{b.drafts} draft{b.drafts === 1 ? "" : "s"}</span>
            {b.gitBranch && <span className="mono xs">code: {b.gitBranch}</span>}
          </p>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="muted small" style={{ marginTop: 14 }}>No drafts in this space yet.</p>
      ) : (
        <div className="ho-mems" style={{ marginTop: 16 }}>
          {list.map((c) => {
            const who = personName(c.provenance.author);
            const color = KIND_COLORS[c.type];
            return (
              <div key={c.id} className="mcard br-draft">
                <span className="bar" style={{ background: color }} />
                <span style={{ minWidth: 0 }}>
                  <span className="t">{c.text}</span>
                  <span className="m">
                    <span className="kchip" style={{ color, background: `color-mix(in srgb, ${color} 13%, white)` }}><i />{KIND[c.type]}</span>
                    <span className="who"><span className="face" style={{ background: colorFor(who) }}>{who[0]}</span>{who} in {aiName(c.provenance.client)}</span>
                    <span>{when(c.provenance.recordedAt)}</span>
                    {c.autoSaved && <span className="auto-chip">Auto</span>}
                  </span>
                  {c.rationale && <span className="br-why">{c.rationale}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {canMerge && (
        <div className="br-actions">
          <form action={mergeBranch}>
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="name" value={b.name} />
            <button className="btn btn-primary btn-sm" disabled={list.length === 0}><Icon name="check" size={13} />Merge into Hivetta</button>
          </form>
          <details className="br-abandon">
            <summary className="btn btn-sm">Abandon…</summary>
            <form action={abandonBranch} className="row">
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="name" value={b.name} />
              <span className="small muted">Close without merging? It can’t be reopened.</span>
              <button className="btn btn-danger btn-sm">Yes, abandon</button>
            </form>
          </details>
        </div>
      )}
    </article>
  );
}
