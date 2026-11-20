import type { Metadata } from "next";
import type { HandoffView } from "@memory/schema";
import { CopyButton } from "@/app/components/client";
import { MemCard } from "@/app/components/dash";
import { MemoryDrawer, withMemory } from "@/app/components/memory-drawer";
import { Rise } from "@/app/landing/parts";
import { Icon, colorFor, when } from "@/app/components/ui";
import { handoffFileName, handoffMarkdown } from "@memory/retrieval";
import { projectFor } from "@/lib/data";
import { aiName, personName } from "@/lib/names";

export const metadata: Metadata = { title: "Handovers" };

const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined);
const SAY = "Write a handover of where we are for the team.";

export default async function HandoffsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { store, project } = await projectFor(id);
  const handoffs = await store.listHandoffs(id, 30);
  const base = `/projects/${id}/handoffs`;
  const latest = handoffs[0];

  return (
    <>
      {sp.m && <MemoryDrawer projectId={id} claimId={sp.m} pageHref={base} />}

      <div className="pg-intro">
        <p>A note on where things stand, for whoever picks the work up next. Handovers can’t be edited: write a new one to correct it.</p>
        <div className="pg-say"><span>Try:</span><span className="say">“{SAY}”</span><CopyButton value={SAY} quiet /></div>
      </div>

      {!latest ? (
        <p className="pg-empty">No handovers yet.</p>
      ) : (
        <>
          <div className="pg-col">
            <div className="md-list">
              {handoffs.map((h, i) => (
                <Rise key={h.id} delay={0.04 * i} y={12}>
                  <MdFile h={h} base={base} projectId={id} projectName={project.name} open={false} />
                </Rise>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}


function Body({ h, base }: { h: HandoffView; base: string }) {
  return (
    <div className="ho-body">
      <p className="ho-summary">{h.summary}</p>

      {(h.nextSteps.length > 0 || h.links.length > 0) && (
        <div className="ho-cols">
          {h.nextSteps.length > 0 && (
            <div>
              <p className="ho-label"><span className="dot" style={{ background: "var(--accent)" }} />Next steps</p>
              <ol className="ho-steps">
                {h.nextSteps.map((s, i) => <li key={i}><span className="n">{i + 1}</span><span>{s}</span></li>)}
              </ol>
            </div>
          )}
          {h.links.length > 0 && (
            <div>
              <p className="ho-label"><span className="dot" style={{ background: "var(--sun)" }} />Where the work lives</p>
              <div className="ho-links">
                {h.links.map((l, i) => {
                  const href = safeHref(l.url);
                  return href ? (
                    <a key={i} href={href} target="_blank" rel="noopener noreferrer nofollow" className="ho-link">
                      <span className="sq xs sq-sun"><Icon name="arrow" size={11} /></span>
                      <span style={{ minWidth: 0 }}><b>{l.label}</b><span className="u">{l.url.replace(/^https?:\/\//, "")}</span></span>
                    </a>
                  ) : (
                    <span key={i} className="xs faint">{l.label}: {l.url}</span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {h.claims.length > 0 && (
        <div>
          <p className="ho-label"><span className="dot" style={{ background: "var(--mint)" }} />Saved with it<span className="faint" style={{ fontWeight: 500 }}> · {h.claims.length}</span></p>
          <div className="ho-mems">{h.claims.map((c) => <MemCard key={c.id} c={c} href={withMemory(base, c.id)} />)}</div>
        </div>
      )}
    </div>
  );
}


const first = (t: string, n = 150) => { const x = t.replace(/\s+/g, " ").trim(); return x.length > n ? `${x.slice(0, n).replace(/\s\S*$/, "")}…` : x; };

/** A handover shown as the Markdown file it is: name, what's inside, then the full note on demand. */
function MdFile({ h, base, projectId, projectName, open }: { h: HandoffView; base: string; projectId: string; projectName: string; open: boolean }) {
  const who = personName(h.provenance.author);
  const file = `/projects/${projectId}/handoffs/${h.id}`;
  return (
    <details className="md-file" id={`h-${h.id}`} open={open}>
      <summary>
        <span className="md-ic" aria-hidden>MD</span>
        <span className="md-main">
          <span className="md-name">{handoffFileName(h)}</span>
          <span className="md-title">{h.title}</span>
          <span className="md-meta">{who} in {aiName(h.provenance.client)} · {when(h.createdAt)}{h.recipient ? ` · for ${h.recipient}` : ""}{h.area ? ` · ${h.area}` : ""}</span>
          <ul className="md-inside">
            <li><b>Where things stand:</b> {first(h.summary)}</li>
            {h.nextSteps.length > 0 && <li><b>{h.nextSteps.length} next step{h.nextSteps.length === 1 ? "" : "s"}</b>, starting with: {first(h.nextSteps[0]!, 90)}</li>}
            {h.links.length > 0 && <li><b>{h.links.length} link{h.links.length === 1 ? "" : "s"}</b> to where the work lives</li>}
            {h.claims.length > 0 && <li><b>{h.claims.length} memor{h.claims.length === 1 ? "y" : "ies"}</b> saved with it</li>}
          </ul>
        </span>
        <span className="md-chev" aria-hidden><Icon name="chevron" size={14} /></span>
      </summary>
      <div className="md-actions">
        <a href={file} target="_blank" rel="noopener" className="btn btn-sm">Open .md</a>
        <a href={`${file}?download=1`} className="btn btn-sm">Download</a>
        <CopyButton value={handoffMarkdown(h, projectName)} label="Copy for your AI" quiet />
      </div>
      <Body h={h} base={base} />
    </details>
  );
}
