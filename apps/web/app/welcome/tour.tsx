"use client";

import { Mark } from "@/app/components/logo";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Icon } from "@/app/components/ui";

/* A guided tour of an example project ("Shop relaunch"). Everything here is made up and lives only
   in the browser: nothing is saved, so the tour never leaves example data in a real account. */

const EASE = [0.22, 1, 0.36, 1] as const;
const C = { decision: "var(--mint)", fact: "var(--sky)", assumption: "var(--lilac)", question: "var(--rose)" } as const;
const PEOPLE = { Edgar: "#2f5d50", Louis: "#3e5c7e", Sara: "#b5573b", Maya: "#7a4e7a" } as const;
type Who = keyof typeof PEOPLE;

const MEMORIES: { t: string; k: keyof typeof C; label: string; who: Who; ai: string; when: string }[] = [
  { t: "Payments go through Stripe Checkout.", k: "decision", label: "Decision", who: "Edgar", ai: "Claude", when: "2 h ago" },
  { t: "Launch is planned for 3 March.", k: "fact", label: "Fact", who: "Louis", ai: "ChatGPT", when: "yesterday" },
  { t: "Most buyers will pay yearly.", k: "assumption", label: "Assumption", who: "Maya", ai: "ChatGPT", when: "yesterday" },
  { t: "Who signs off the pricing page?", k: "question", label: "Open question", who: "Sara", ai: "Claude", when: "3 days ago" },
];

const STEPS = [
  { page: "overview", title: "This is a project’s memory", text: "Every decision your team makes with their AIs lands here. This example is “Shop relaunch”, with four people using three different AIs." },
  { page: "memory", title: "Every memory says who and where", text: "Who saved it, with which AI, and when. So you always know where an answer comes from." },
  { page: "conflict", title: "When two AIs disagree, you decide", text: "Sara’s AI saved “switch to PayPal”, but the team chose Stripe. Nothing is overwritten: a person picks. Try it: click “Keep this one” on Stripe." },
  { page: "handover", title: "Handovers keep the why", text: "Finished your part? Your AI writes a handover. The next person’s AI reads it before they start." },
  { page: "end", title: "Your turn", text: "Set up your own team in about two minutes: name your workspace, create a project, connect your AI." },
] as const;

export function Tour({ signedIn }: { signedIn: boolean }) {
  const [i, setI] = useState(0);
  const [kept, setKept] = useState(false);
  const reduce = useReducedMotion();
  const step = STEPS[i]!;
  const blocked = step.page === "conflict" && !kept;
  const finish = signedIn ? "/setup" : "/login?mode=signup";

  return (
    <div className="tour">
      <header className="tour-top">
        <span className="brand"><Mark size={28} />Hivetta</span>
        <span className="mono-label faint">Quick tour · {i + 1} of {STEPS.length}</span>
        <Link href={finish} className="small muted" style={{ textDecoration: "underline" }}>Skip the tour</Link>
      </header>

      <div className="tour-stage">
        <div className="tour-app" aria-hidden>
          <aside className="tour-side">
            <div className="tour-ws"><span className="ws-badge" style={{ background: "#9db4cc" }}>A</span><span><span className="ws-k">Workspace</span>Acme</span></div>
            <p className="tour-nav"><Icon name="home" size={14} />Home</p>
            <p className="tour-nav sub-top" data-on={step.page === "conflict" || undefined}>
              <Icon name="alert" size={14} />Needs you
              <AnimatePresence>{!kept && <motion.span exit={{ scale: 0, opacity: 0 }} className="count count-warn" style={{ marginLeft: "auto" }}>1</motion.span>}</AnimatePresence>
            </p>
            <p className="nav-label" style={{ padding: "14px 8px 4px" }}>Projects</p>
            <p className={`tour-nav proj${i === 0 ? " glow" : ""}`}><span style={{ display: "inline-flex", rotate: "90deg" }}><Icon name="chevron" size={12} /></span><span className="proj-dot sm" style={{ background: "#e2b25a" }}>S</span>Shop relaunch</p>
            {[["overview", "Overview", "eye"], ["memory", "Memory", "memory"], ["handover", "Handovers", "note"], ["", "Drafts", "branch"], ["", "People", "people"]].map(([pg, label, ic]) => (
              <p key={label} className="tour-nav sub" data-on={step.page === pg || undefined}>
                <Icon name={ic as "eye"} size={13} />{label}
              </p>
            ))}
            <p className="tour-nav"><Icon name="chevron" size={12} /><span className="proj-dot sm" style={{ background: "#c9a3c6" }}>P</span>Pricing 2027</p>
          </aside>

          <div className="tour-main">
            <AnimatePresence mode="wait">
              <motion.div key={step.page} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: EASE }}>
                {step.page === "overview" && <Overview />}
                {step.page === "memory" && <MemoryList highlight />}
                {step.page === "conflict" && <Conflict kept={kept} onKeep={() => setKept(true)} />}
                {step.page === "handover" && <Handover />}
                {step.page === "end" && <EndScreen />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={i} className="tour-coach" role="dialog" aria-live="polite" aria-label={step.title}
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4, ease: EASE }}>
            <p className="mono-label" style={{ color: "#efd9d5" }}>Step {i + 1} of {STEPS.length}</p>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
            <div className="tour-dots" aria-hidden>{STEPS.map((_, k) => <span key={k} data-on={k === i || undefined} />)}</div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
              {i > 0 ? <button type="button" className="btn btn-sm tour-back" onClick={() => setI(i - 1)}>Back</button> : <span />}
              {step.page === "end" ? (
                <Link href={finish} className="btn btn-light">{signedIn ? "Set up my team" : "Create my account"}<Icon name="arrow" size={14} /></Link>
              ) : (
                <button type="button" className="btn btn-light" disabled={blocked} onClick={() => setI(i + 1)}>
                  {blocked ? "Pick one first" : "Next"}<Icon name="arrow" size={14} />
                </button>
              )}
            </div>
            {blocked && <span className="tour-hand">click “Keep this one” on Stripe</span>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Head({ title, crumb }: { title: React.ReactNode; crumb: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <p className="crumb">{crumb}</p>
      <h3 className="tour-h">{title}</h3>
    </div>
  );
}

function Mem({ m, highlight }: { m: (typeof MEMORIES)[number]; highlight?: boolean }) {
  return (
    <div className="tour-mem">
      <span className="bar" style={{ background: C[m.k] }} />
      <div>
        <p className="t">{m.t}</p>
        <p className={`m${highlight ? " glow" : ""}`}>
          <b style={{ color: C[m.k] }}>{m.label}</b>
          <span className="face" style={{ background: PEOPLE[m.who] }}>{m.who[0]}</span>{m.who} in {m.ai} · {m.when}
        </p>
      </div>
    </div>
  );
}

function Overview() {
  return (
    <>
      <Head crumb="Acme / Shop relaunch" title="Overview" />
      <div className="tour-stats">
        {[["12", "Decisions", "decision"], ["31", "Facts", "fact"], ["6", "Assumptions", "assumption"], ["4", "Open questions", "question"]].map(([n, l, k]) => (
          <div key={l} className="tour-stat" style={{ background: `color-mix(in srgb, ${C[k as keyof typeof C]} 10%, white)` }}>
            <b style={{ color: C[k as keyof typeof C] }}>{n}</b><span>{l}</span>
          </div>
        ))}
      </div>
      <p className="mono-label muted" style={{ margin: "16px 0 8px" }}>Latest decisions</p>
      <div className="tour-list"><Mem m={MEMORIES[0]!} /><Mem m={{ ...MEMORIES[0]!, t: "Free tier stays at 3 seats.", who: "Maya", ai: "ChatGPT", when: "2 days ago" }} /></div>
    </>
  );
}

function MemoryList({ highlight }: { highlight?: boolean }) {
  return (
    <>
      <Head crumb="Acme / Shop relaunch" title="Memory" />
      <div className="tour-search"><Icon name="search" size={14} />Ask anything, e.g. “how do we take payments?”</div>
      <div className="tour-list">{MEMORIES.map((m) => <Mem key={m.t} m={m} highlight={highlight} />)}</div>
    </>
  );
}

function Conflict({ kept, onKeep }: { kept: boolean; onKeep: () => void }) {
  return (
    <>
      <Head crumb="Acme / Shop relaunch" title="Needs you" />
      <AnimatePresence mode="wait">
        {!kept ? (
          <motion.div key="c" className="tour-conflict" exit={{ opacity: 0, scale: 0.97 }}>
            <p className="why"><b>Why the AI checker stopped here</b>Both say how the shop takes payments, but name different providers.</p>
            <div className="vs-row">
              <div className="side">
                <Mem m={MEMORIES[0]!} />
                <button type="button" className="btn btn-primary btn-sm pulse-btn" onClick={onKeep}>Keep this one</button>
              </div>
              <span className="vs">vs</span>
              <div className="side">
                <Mem m={{ t: "Let’s switch payments to PayPal.", k: "decision", label: "Decision", who: "Sara", ai: "Claude", when: "10 min ago" }} />
                <button type="button" className="btn btn-sm" disabled>Keep this one</button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="ok" className="tour-ok" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <span className="done-badge"><Icon name="check" size={22} /></span>
            <p style={{ fontWeight: 700, fontSize: 18 }}>Stripe kept. One answer for everyone.</p>
            <p className="muted small">Sara’s PayPal idea is saved in History, with the reason. Next time anyone asks their AI, it says Stripe.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Handover() {
  return (
    <>
      <Head crumb="Acme / Shop relaunch" title="Handovers" />
      <div className="tour-hand-card">
        <p style={{ fontWeight: 700 }}>Payments module, for Louis</p>
        <p className="faint xs" style={{ marginTop: 2 }}>Written by Edgar’s Claude · today</p>
        <p className="muted small" style={{ marginTop: 10 }}>Checkout works in test mode. Stripe keys are in the team vault. The webhook still needs wiring.</p>
        <ol className="steps small" style={{ marginTop: 10 }}>
          <li>Connect the payment webhook</li>
          <li>Test a refund end to end</li>
        </ol>
      </div>
    </>
  );
}

function EndScreen() {
  return (
    <div className="tour-end">
      <p className="mono-label" style={{ color: "var(--accent)" }}>That’s it</p>
      <h3 className="tour-h" style={{ fontSize: 30 }}>One memory for your team, <em className="serif-em">whatever AI each person uses.</em></h3>
      <div className="tour-end-steps">
        {["Name your workspace", "Create a project", "Connect your AI", "Invite your team"].map((t, k) => (
          <p key={t}><span>{k + 1}</span>{t}</p>
        ))}
      </div>
    </div>
  );
}
