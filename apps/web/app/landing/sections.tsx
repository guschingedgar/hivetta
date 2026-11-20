"use client";

import { Mark } from "@/app/components/logo";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { Check, Chip, CountUp, EASE, Icon, KIND_COLOR, KIND_LABEL, PEOPLE, Who, Window, useScript, type Kind, type Person } from "./parts";

/* ============================ Problem: islands ============================ */

const ISLANDS: { who: Person; answer: string; kind: Kind | null; pos: React.CSSProperties; bob: number; tilt: number }[] = [
  { who: "Edgar", answer: "Stripe Checkout", kind: "decision", pos: { left: "6%", top: "14%" }, bob: 0, tilt: -3 },
  { who: "Louis", answer: "PayPal, I think?", kind: null, pos: { right: "6%", top: "10%" }, bob: 1.2, tilt: 2.5 },
  { who: "Sara", answer: "No idea, ask Edgar", kind: null, pos: { left: "50%", bottom: "7%", marginLeft: -125 }, bob: 2.1, tilt: -1.5 },
];

export function Islands() {
  const reduce = useReducedMotion();
  return (
    <div className="lp-islands" role="img" aria-label="Three teammates ask their own AI which payment provider the team chose and get three different answers, because their chats share no memory.">
      <svg className="links" viewBox="0 0 1000 380" preserveAspectRatio="none" aria-hidden>
        {[["M250 110 Q500 40 750 100"], ["M230 150 Q330 280 470 300"], ["M770 150 Q680 280 560 300"]].map(([d], i) => (
          <motion.path key={i} d={d} fill="none" stroke="#7a1e2c66" strokeWidth="2" strokeDasharray="6 9"
            animate={reduce ? undefined : { strokeDashoffset: [0, -60] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} />
        ))}
      </svg>
      {ISLANDS.map((isl) => (
        <motion.div key={isl.who} className="lp-island" style={{ ...isl.pos, rotate: isl.tilt, borderTopColor: PEOPLE[isl.who].color }} aria-hidden
          animate={reduce ? undefined : { y: [0, -10, 0], rotate: [isl.tilt, isl.tilt + (isl.bob % 2 ? 0.8 : -0.8), isl.tilt] }}
          transition={{ duration: 5 + isl.bob, repeat: Infinity, ease: "easeInOut", delay: isl.bob }}>
          <Who name={isl.who} />
          <p className="q">Which payment provider did we pick?</p>
          <p className="a" style={isl.kind ? { background: "color-mix(in srgb, var(--decision) 14%, white)", color: "#2f5d50" } : { background: "color-mix(in srgb, var(--question) 12%, white)", color: "#9a3f2b" }}>{isl.answer}</p>
        </motion.div>
      ))}
      <div className="lp-island-water" aria-hidden>
        <motion.span className="q-mark" animate={reduce ? undefined : { scale: [1, 1.12, 1] }} transition={{ duration: 2.4, repeat: Infinity }}>?</motion.span>
        No shared memory
      </div>
    </div>
  );
}

/* ============================ How it works ============================ */

const STEPS = [
  { title: "Connect your AI", text: "Each teammate adds Hivetta to their own Claude or ChatGPT, once. About two minutes.", say: null, bg: "#f3e3e1" },
  { title: "Say what to remember", text: "At the end of a conversation, ask your assistant to save it. It picks out the decisions, facts and open questions.", say: "Save what we decided to Hivetta.", bg: "#f3e3e1" },
  { title: "Anyone picks it up", text: "Tomorrow, a teammate asks their own assistant and starts from where the team really is.", say: "Brief me on the shop relaunch.", bg: "#f3e3e1" },
];

const CONNECT_STEPS = [900, 900, 1300, 2600];
function ConnectScene() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useScript(ref, CONNECT_STEPS, 3);
  const on = s >= 2;
  return (
    <div ref={ref} style={{ width: "100%", maxWidth: 520 }}>
      <Window title="Claude · Connectors" meta="Edgar">
        <div className="lp-row"><span className="ico" style={{ background: "#efe6d8" }}><Icon d={<><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></>} /></span><div><p>Calendar</p><p className="sub">Connected</p></div><span className="lp-toggle" style={{ background: "var(--decision)", justifyContent: "flex-end" }}><span /></span></div>
        <motion.div className="lp-row" animate={{ borderColor: on ? "#bcd5ca" : "#e4d9c6", boxShadow: s >= 1 ? "0 10px 30px -16px rgba(53,179,131,.6)" : "0 0 0 rgba(0,0,0,0)" }} transition={{ duration: 0.4 }}>
          <span className="ico" style={{ background: "#f5eee3" }}><Mark size={22} /></span>
          <div><p style={{ fontWeight: 600 }}>Hivetta</p><p className="sub">{on ? "Connected to your team’s Hivetta" : "Custom connector"}</p></div>
          <motion.span className="lp-toggle" animate={{ backgroundColor: on ? "#2f5d50" : "#e4d9c6" }} transition={{ duration: 0.3 }} style={{ justifyContent: on ? "flex-end" : "flex-start" }}>
            <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 30 }} />
          </motion.span>
        </motion.div>
        <div className="lp-row"><span className="ico" style={{ background: "#efe6d8" }}><Icon d={<><path d="M4 6h16v12H4z" /><path d="m4 7 8 6 8-6" /></>} /></span><div><p>Email</p><p className="sub">Not connected</p></div><span className="lp-toggle"><span /></span></div>
        <AnimatePresence>
          {s >= 3 && (
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}
              style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#2f5d50", fontWeight: 600 }}>
              <span style={{ width: 22, height: 22, borderRadius: 999, background: "var(--decision)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Check size={12} /></span>
              Ready. Your assistant can now read and save to Hivetta.
            </motion.p>
          )}
        </AnimatePresence>
      </Window>
    </div>
  );
}

const SAVE_STEPS = [1100, 1100, 1300, 900, 900, 900, 2400];
function SaveScene() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useScript(ref, SAVE_STEPS, 6);
  const saved: { text: string; kind: Kind }[] = [
    { text: "Payments go through Stripe Checkout.", kind: "decision" },
    { text: "Stripe takes 1.5% + 25c per card in Europe.", kind: "fact" },
    { text: "Who signs off the pricing page?", kind: "question" },
  ];
  return (
    <div ref={ref} style={{ width: "100%", maxWidth: 540 }}>
      <Window title="Claude · Edgar" meta="Shop relaunch">
        <div className="lp-msgs">
          {s >= 0 && <motion.p className="lp-msg me" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>Save what we decided to Hivetta.</motion.p>}
          {s === 1 && <motion.span className="lp-typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><i /><i /><i /></motion.span>}
          {s >= 2 && <motion.p className="lp-msg ai" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>Done. I saved 3 memories to <b>Shop relaunch</b>:</motion.p>}
          <div style={{ display: "grid", gap: 8 }}>
            {saved.map((m, i) => s >= 3 + i && (
              <motion.div key={m.text} className="lp-card" initial={{ opacity: 0, x: -20, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}>
                <span className="bar" style={{ background: KIND_COLOR[m.kind] }} />
                <div>
                  <p className="t">{m.text}</p>
                  <p className="m"><span className="lp-kind" style={{ color: KIND_COLOR[m.kind] }}>{KIND_LABEL[m.kind]}</span><span className="lp-status" style={{ color: "var(--decision)" }}><Check size={12} />Added</span></p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </Window>
    </div>
  );
}

const PICK_STEPS = [1100, 1300, 700, 700, 700, 2600];
function PickupScene() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useScript(ref, PICK_STEPS, 5);
  const lines: { kind: Kind; text: string; who: Person; when: string }[] = [
    { kind: "decision", text: "Payments go through Stripe Checkout.", who: "Edgar", when: "yesterday" },
    { kind: "fact", text: "Launch is planned for 3 March.", who: "Louis", when: "2 days ago" },
    { kind: "question", text: "Still open: who signs off the pricing page?", who: "Sara", when: "yesterday" },
  ];
  return (
    <div ref={ref} style={{ width: "100%", maxWidth: 540 }}>
      <Window title="ChatGPT · Louis" meta="the next day">
        <div className="lp-msgs">
          <motion.p className="lp-msg me" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>Brief me on the shop relaunch.</motion.p>
          {s === 1 && <motion.span className="lp-typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><i /><i /><i /></motion.span>}
          {s >= 2 && (
            <motion.div className="lp-msg ai" style={{ maxWidth: "94%" }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <p>From your team’s Hivetta:</p>
              {lines.map((l, i) => s >= 2 + i && (
                <motion.div key={l.text} className="lp-li" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
                  <span className="dot" style={{ background: KIND_COLOR[l.kind] }} />
                  <span>{l.text} <small>{l.who} in {PEOPLE[l.who].tool}, {l.when}</small></span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </Window>
    </div>
  );
}

const SCENES = [ConnectScene, SaveScene, PickupScene];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (p) => setActive(Math.min(2, Math.floor(p * 3.0001))));
  const fill = [
    useTransform(scrollYProgress, [0, 1 / 3], ["0%", "100%"]),
    useTransform(scrollYProgress, [1 / 3, 2 / 3], ["0%", "100%"]),
    useTransform(scrollYProgress, [2 / 3, 1], ["0%", "100%"]),
  ];
  const Scene = SCENES[active]!;

  return (
    <>
      <div ref={ref} className="lp-story">
        <div className="lp-story-sticky">
          <div className="lp-wrap lp-story-grid">
            <ol className="lp-steps">
              {STEPS.map((st, i) => (
                <li key={st.title} className={`lp-step${i === active ? " on" : ""}`}>
                  <span className="rail"><motion.span style={{ height: fill[i] }} /></span>
                  <p className="n">Step {i + 1}</p>
                  <h3>{st.title}</h3>
                  <AnimatePresence initial={false}>
                    {i === active && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4, ease: EASE }} style={{ overflow: "hidden" }}>
                        <p>{st.text}</p>
                        {st.say && <span className="say">“{st.say}”</span>}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              ))}
            </ol>
            <motion.div className="lp-stage" animate={{ background: STEPS[active]!.bg }} transition={{ duration: 0.6 }}>
              <AnimatePresence mode="wait">
                <motion.div key={active} style={{ width: "100%", display: "flex", justifyContent: "center" }}
                  initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.98 }} transition={{ duration: 0.5, ease: EASE }}>
                  <Scene />
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="lp-wrap lp-story-mobile">
        {STEPS.map((st, i) => {
          const S = SCENES[i]!;
          return (
            <div key={st.title}>
              <div className="lp-step on" style={{ marginBottom: 12 }}>
                <p className="n">Step {i + 1}</p>
                <h3>{st.title}</h3>
                <p>{st.text}</p>
                {st.say && <span className="say">“{st.say}”</span>}
              </div>
              <div className="lp-stage" style={{ background: st.bg }}><S /></div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ============================ Bento tiles ============================ */

const SEARCH_STEPS = [2000, 900, 3400, 500];
const QUERY = "how do we take payments?";
const RESULTS: { k: Kind; t: string; w: Person; d: string }[] = [
  { k: "decision", t: "Payments go through Stripe Checkout, to keep card data off our servers.", w: "Edgar", d: "2 days ago" },
  { k: "fact", t: "Stripe takes 1.5% + 25c per European card payment.", w: "Louis", d: "yesterday" },
  { k: "question", t: "Do we need invoices in euros and dollars?", w: "Sara", d: "today" },
];
export function SearchArt() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useScript(ref, SEARCH_STEPS, 2);
  return (
    <div ref={ref}>
      <div className="lp-search">
        <Icon d={<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>} />
        {s === 0 ? <TypeOut text={QUERY} /> : <span>{QUERY}</span>}
        {s === 0 && <span className="caret" />}
        {s === 1 && <span className="lp-spin" style={{ marginLeft: "auto", color: "var(--fact)" }} />}
      </div>
      <div className="lp-results">
        {RESULTS.map((r, i) => (
          <div key={r.t} style={{ position: "relative", minHeight: 64 }}>
            <AnimatePresence mode="wait" initial={false}>
              {s >= 2 ? (
                <motion.div key="r" className="lp-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: EASE, delay: i * 0.14 }}>
                  <span className="bar" style={{ background: KIND_COLOR[r.k] }} />
                  <div><p className="t">{r.t}</p><p className="m"><span className="lp-kind" style={{ color: KIND_COLOR[r.k] }}>{KIND_LABEL[r.k]}</span><Who name={r.w} /><span>{r.d}</span></p></div>
                </motion.div>
              ) : (
                <motion.div key="s" className="lp-skel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeOut({ text }: { text: string }) {
  return (
    <span>
      {text.split("").map((ch, i) => (
        <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.055, duration: 0.01 }}>{ch}</motion.span>
      ))}
    </span>
  );
}

export function CountsArt() {
  const rows: { k: Kind; n: number; label: string }[] = [
    { k: "decision", n: 12, label: "Decisions" },
    { k: "fact", n: 31, label: "Facts" },
    { k: "assumption", n: 6, label: "Assumptions" },
    { k: "question", n: 4, label: "Open questions" },
  ];
  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.k} className="lp-count-row">
          <CountUp to={r.n} className="n" />
          <span className="l">{r.label}</span>
          <span className="track"><motion.span style={{ background: KIND_COLOR[r.k] }} initial={{ width: 0 }} whileInView={{ width: `${(r.n / 31) * 100}%` }} viewport={{ once: true }} transition={{ duration: 1.2, ease: EASE, delay: 0.1 * i }} /></span>
        </div>
      ))}
    </div>
  );
}

const CLASH_STEPS = [1200, 1100, 1700, 1300, 2200];
export function ClashArt() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useScript(ref, CLASH_STEPS, 2);
  const warn = s >= 2 && s <= 3;
  return (
    <div ref={ref} style={{ display: "grid", gap: 10 }}>
      <motion.div className="lp-card" animate={{ x: s === 2 ? [0, -6, 6, -3, 3, 0] : 0, boxShadow: warn ? "0 0 0 2px #b07a1a, 0 10px 24px -12px #b07a1a" : "0 6px 16px -12px rgba(27,32,64,.25)" }} transition={{ duration: 0.5 }}>
        <span className="bar" style={{ background: "var(--decision)" }} />
        <div><p className="t">Payments go through Stripe Checkout.</p><p className="m"><Who name="Edgar" /><span className="lp-status" style={{ color: s >= 4 ? "var(--decision)" : undefined }}>{s >= 4 ? "Kept" : "Decision"}</span></p></div>
      </motion.div>
      <AnimatePresence>
        {s >= 1 && s <= 3 && (
          <motion.div className="lp-card" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0, x: s === 2 ? [0, 6, -6, 3, -3, 0] : 0, boxShadow: warn ? "0 0 0 2px #b07a1a, 0 10px 24px -12px #b07a1a" : "0 6px 16px -12px rgba(27,32,64,.25)" }} exit={{ opacity: 0, scale: 0.9, height: 0 }} transition={{ duration: 0.5, ease: EASE }}>
            <span className="bar" style={{ background: "var(--decision)" }} />
            <div><p className="t">Let’s switch payments to PayPal.</p><p className="m"><Who name="Sara" /><span className="lp-status" style={{ color: warn ? "var(--person)" : "var(--fact)" }}>{warn ? "Disagrees" : <><span className="lp-spin" />Checking</>}</span></p></div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {warn && (
          <motion.div className="lp-decide" style={{ marginTop: 0 }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
            <span className="k">A person decides</span>
            <span className="lp-mini-btn primary" style={{ transform: s === 3 ? "scale(.93)" : undefined, transition: "transform .15s" }}>Keep Stripe</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const NOTE_STEPS = [900, 800, 800, 800, 2400];
export function HandoverArt() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useScript(ref, NOTE_STEPS, 4);
  const items = ["Checkout works in test mode", "Connect the payment webhook", "Test a refund end to end"];
  return (
    <div ref={ref} className="lp-note">
      <p className="h">Payments module, for Louis</p>
      <p style={{ marginTop: 4, fontSize: 12.5, color: "var(--faint)" }}>Written by Edgar’s assistant · links: shop / feature/checkout</p>
      {items.map((t, i) => (
        <motion.div key={t} className="lp-check" initial={{ opacity: 0.35 }} animate={{ opacity: s >= i + 1 ? 1 : 0.35 }} transition={{ duration: 0.3 }}>
          <motion.span className="box" animate={{ backgroundColor: s >= i + 1 && i === 0 ? "#7a4e7a" : "#ffffff", borderColor: s >= i + 1 ? "#7a4e7a" : "#dcc6da" }}>
            {s >= i + 1 && i === 0 && <span style={{ color: "#fff" }}><Check size={12} /></span>}
          </motion.span>
          <span style={{ textDecoration: i === 0 && s >= 1 ? "line-through" : undefined, color: i === 0 && s >= 1 ? "var(--faint)" : undefined }}>{i === 0 ? t : `Next: ${t.toLowerCase()}`}</span>
        </motion.div>
      ))}
    </div>
  );
}

const DRAFT_STEPS = [1400, 1000, 1400, 1800];
export function DraftsArt() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useScript(ref, DRAFT_STEPS, 3);
  const merged = s >= 2;
  return (
    <div ref={ref} style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 650 }}>
        <span className="lp-chip" style={{ background: "#fff", color: "var(--question)" }}>new-pricing</span>
        <span style={{ color: "var(--faint)", fontWeight: 500 }}>{merged ? "merged into Hivetta" : "3 drafts, not shared yet"}</span>
      </div>
      {["Offer a yearly plan at 20% off", "Keep the free tier at 3 seats", "Show prices in euros first"].map((t, i) => (
        <motion.div key={t} className="lp-card" animate={{ x: s === 1 ? 6 : 0, borderColor: merged ? "#bcd5ca" : "#ecc9bd", opacity: 1 }} transition={{ duration: 0.4, delay: i * 0.08 }} style={{ borderStyle: merged ? "solid" : "dashed" }}>
          <span className="bar" style={{ background: merged ? "var(--decision)" : "var(--question)" }} />
          <div><p className="t" style={{ fontSize: 14 }}>{t}</p><p className="m">{merged ? <span className="lp-status" style={{ color: "var(--decision)" }}><Check size={12} />Checked and added</span> : <span>Draft</span>}</p></div>
        </motion.div>
      ))}
    </div>
  );
}

const HIST_STEPS = [1500, 1300, 2600];
export function HistoryArt() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useScript(ref, HIST_STEPS, 2);
  return (
    <div ref={ref} className="lp-note" style={{ display: "grid", gap: 8 }}>
      <motion.p animate={{ color: s >= 1 ? "#9a8b84" : "#2a1f1f" }} style={{ fontWeight: 600, position: "relative", width: "fit-content" }}>
        Launch in February
        <motion.span style={{ position: "absolute", left: 0, top: "52%", height: 2, background: "#9a8b84" }} animate={{ width: s >= 1 ? "100%" : "0%" }} transition={{ duration: 0.5, ease: EASE }} />
      </motion.p>
      <AnimatePresence>
        {s >= 1 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            <p style={{ fontWeight: 700 }}>Launch on 3 March</p>
            <p style={{ marginTop: 4, fontSize: 12.5, color: "var(--faint)" }}>Replaced by Louis: “Payment provider needs two more weeks.”</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TeamArt() {
  const people: Person[] = ["Edgar", "Louis", "Sara", "Maya"];
  return (
    <div className="lp-people">
      {people.map((p, i) => (
        <motion.div key={p} className="lp-person" initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, ease: EASE, delay: i * 0.12 }}>
          <span className="lp-face" style={{ background: PEOPLE[p].color }}>{p[0]}</span>{p}<span className="tool">{PEOPLE[p].tool}</span>
        </motion.div>
      ))}
    </div>
  );
}

export { Chip };
