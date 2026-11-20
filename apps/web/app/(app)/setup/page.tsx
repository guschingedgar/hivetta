import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createProject, createWorkspace, inviteMember } from "@/app/actions";
import { AIS, ConnectGuide } from "@/app/components/connect-steps";
import { CopyButton, LiveCheck } from "@/app/components/client";
import { Flash } from "@/app/components/flash";
import { Icon } from "@/app/components/ui";
import { myProjects, myWorkspaces, setupState } from "@/lib/data";
import { mcpUrl } from "@/lib/env";

export const metadata: Metadata = { title: "Setup" };

const KEYS = ["workspace", "project", "connect", "invite", "done"] as const;
type Key = (typeof KEYS)[number];

const TRY = "Save to Hivetta that we’re trying it out.";

export default async function SetupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [setup, workspaces, projects, jar] = await Promise.all([setupState(), myWorkspaces(), myProjects(), cookies()]);
  const step: Key = (KEYS as readonly string[]).includes(sp.step ?? "") ? (sp.step as Key) : (setup.next ?? "done");
  const isNew = sp.new === "1";
  const adminOf = workspaces.filter((w) => w.role === "admin");
  const preferred = adminOf.find((w) => w.id === jar.get("cm_ws")?.value) ?? adminOf[0];
  const projectInWs = projects.find((p) => p.workspaceId === preferred?.id && p.role === "admin") ?? projects.find((p) => p.role === "admin");
  const ai = AIS.find((a) => a.key === sp.ai) ?? AIS[0];
  const status = Object.fromEntries(setup.steps.map((s) => [s.key, s.done])) as Record<string, boolean>;
  const after = (k: Key) => {
    const i = KEYS.indexOf(k);
    const rest = setup.steps.slice(i + 1).find((s) => !s.done);
    return `/setup?step=${rest?.key ?? "done"}`;
  };

  return (
    <div className="page setup">
      <div className="page-head">
        <div>
          <p className="crumb">{setup.done} of {setup.total} steps done</p>
          <h1>Let’s get your team <em className="serif-em">remembering</em></h1>
          
        </div>
      </div>
      <Flash error={sp.error} notice={sp.notice} />

      <div className="setup-grid">
        <ol className="stepper" aria-label="Setup steps">
          {setup.steps.map((s, i) => (
            <li key={s.key}>
              <Link href={`/setup?step=${s.key}`} className="stepper-item" aria-current={step === s.key ? "step" : undefined} data-done={s.done || undefined}>
                <span className="stepper-n">{s.done ? <Icon name="check" size={13} /> : i + 1}</span>
                <span>{s.title}</span>
              </Link>
            </li>
          ))}
        </ol>

        <section className="card setup-card">
          {step === "workspace" && (
            status.workspace && !isNew ? (
              <Done title="Your workspace is ready" next={after("workspace")}>
                <p className="muted">You’re in {workspaces.map((w) => <b key={w.id}>{w.name} </b>)}. Need another one, for a different company?{" "}
                  <Link href="/setup?step=workspace&new=1" style={{ color: "var(--accent)" }}>Create a new workspace</Link>.</p>
              </Done>
            ) : (
              <>
                <StepHead n={1} title={<>Name your <em className="serif-em">workspace</em></>}>
                  Your team or company.
                </StepHead>
                <form action={createWorkspace} className="stack">
                  <input type="hidden" name="return_to" value={isNew ? "/projects" : "/setup?step=project"} />
                  <input type="hidden" name="error_to" value="/setup?step=workspace" />
                  <label className="field">Workspace name<input name="name" required maxLength={100} placeholder="e.g. Acme" autoFocus /></label>
                  <div className="row"><button className="btn btn-primary">Create workspace<Icon name="arrow" size={14} /></button></div>
                </form>
              </>
            )
          )}

          {step === "project" && (
            !preferred ? (
              <NeedFirst href="/setup?step=workspace" what="a workspace" />
            ) : status.project && !isNew ? (
              <Done title="You have a project" next={after("project")}>
                <p className="muted">Add more anytime from the <b>+</b> next to Projects in the sidebar.</p>
              </Done>
            ) : (
              <>
                <StepHead n={2} title={<>Create your first <em className="serif-em">project</em></>}>
                  A product, a client, a launch… Each has its own memory.
                </StepHead>
                <form action={createProject} className="stack">
                  {!(isNew && status.connect) && <input type="hidden" name="return_to" value={isNew ? "" : "/setup?step=connect"} />}
                  <input type="hidden" name="error_to" value="/setup?step=project" />
                  {adminOf.length > 1 ? (
                    <label className="field">Workspace
                      <select name="workspace_id" defaultValue={preferred.id}>{adminOf.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
                    </label>
                  ) : <input type="hidden" name="workspace_id" value={preferred.id} />}
                  <label className="field">Project name<input name="name" required maxLength={100} placeholder="e.g. Shop relaunch" autoFocus /></label>
                  <div className="row"><button className="btn btn-primary">Create project<Icon name="arrow" size={14} /></button></div>
                </form>
              </>
            )
          )}

          {step === "connect" && (
            <>
              <StepHead n={3} title={<>Connect <em className="serif-em">your AI</em></>}>
                Add Hivetta to your assistant once. After that, it’s just there in every chat.
              </StepHead>
              <ConnectGuide url={mcpUrl()} ai={ai.key} hrefFor={(k) => `/setup?step=connect&ai=${k}`} />
              <div className="try-box">
                <p className="small" style={{ fontWeight: 600 }}>Then say this to your AI</p>
                <div className="prompt-row"><span className="prompt">{TRY}</span><CopyButton value={TRY} quiet /></div>
              </div>
              <LiveCheck initiallyConnected={Boolean(status.connect)} next={after("connect")} />
              <p className="small" style={{ marginTop: 14 }}><Link href={after("connect")} className="faint" style={{ textDecoration: "underline" }}>Skip for now</Link></p>
            </>
          )}

          {step === "invite" && (
            !preferred || !projectInWs ? (
              <NeedFirst href={!preferred ? "/setup?step=workspace" : "/setup?step=project"} what={!preferred ? "a workspace" : "a project"} />
            ) : (
              <>
                <StepHead n={4} title={<>Invite your <em className="serif-em">team</em></>}>
                  They join <b>{preferred.name}</b> and see everything already saved.
                </StepHead>
                <form action={inviteMember} className="stack">
                  <input type="hidden" name="workspace_id" value={preferred.id} />
                  <input type="hidden" name="project_id" value={projectInWs.id} />
                  <input type="hidden" name="return_to" value="/setup?step=invite" />
                  <div className="invite-row">
                    <label className="field" style={{ flex: 1 }}>Their email<input name="email" type="email" required placeholder="louis@company.com" /></label>
                    <label className="field">Can
                      <select name="role" defaultValue="contributor">
                        <option value="contributor">Save and read</option>
                        <option value="viewer">Only read</option>
                        <option value="admin">Everything (admin)</option>
                      </select>
                    </label>
                  </div>
                  <div className="row">
                    <button className="btn btn-primary">Send invite<Icon name="arrow" size={14} /></button>
                    <Link href="/setup?step=done" className="btn">{status.invite ? "I’m done" : "Skip for now"}</Link>
                  </div>
                  
                </form>
              </>
            )
          )}

          {step === "done" && (
            <div className="setup-done">
              <span className="done-badge"><Icon name="check" size={26} /></span>
              <h2>{setup.done === setup.total ? <>You’re all <em className="serif-em">set</em></> : <>Good <em className="serif-em">start</em></>}</h2>
              <p className="muted">
                {setup.done === setup.total
                  ? "From now on, just talk to your AI. Whatever it saves, your whole team’s AIs can find."
                  : `${setup.total - setup.done} step${setup.total - setup.done === 1 ? "" : "s"} left. Finish them anytime from Setup in the sidebar.`}
              </p>
              <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
                {projects[0] && <Link href={`/projects/${projects[0].id}`} className="btn btn-primary">Open your project<Icon name="arrow" size={14} /></Link>}
                <Link href="/projects" className="btn">Go home</Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StepHead({ n, title, children }: { n: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p className="faint small">Step {n} of 4</p>
      <h2 className="setup-h">{title}</h2>
      <p className="muted" style={{ marginTop: 6 }}>{children}</p>
    </div>
  );
}

function Done({ title, next, children }: { title: string; next: string; children: React.ReactNode }) {
  return (
    <div className="stack">
      <p className="row" style={{ color: "var(--mint)", fontWeight: 650 }}><Icon name="check" size={16} />{title}</p>
      {children}
      <div className="row"><Link href={next} className="btn btn-primary">Next step<Icon name="arrow" size={14} /></Link></div>
    </div>
  );
}

function NeedFirst({ href, what }: { href: string; what: string }) {
  return (
    <div className="stack">
      <p className="muted">You need {what} first.</p>
      <div className="row"><Link href={href} className="btn btn-primary">Do that now</Link></div>
    </div>
  );
}
