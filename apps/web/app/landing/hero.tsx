"use client";

import { Mark } from "@/app/components/logo";
import Link from "next/link";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { Check, Chip, Cursor, EASE, KIND_COLOR, KIND_LABEL, Note, PEOPLE, Who, Words, useScript, type Kind, type Person } from "./parts";

export function Nav({ signedIn }: { signedIn: boolean }) {
  const { scrollY } = useScroll();
  const [compact, setCompact] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setCompact(y > 40));
  return (
    <div className="lp-nav-shell">
      <motion.nav className="lp-nav" aria-label="Main" animate={{ paddingTop: compact ? 6 : 8, paddingBottom: compact ? 6 : 8, scale: compact ? 0.98 : 1 }} transition={{ duration: 0.3, ease: EASE }}>
        <Link href="/" className="lp-brand"><Mark size={26} />Hivetta</Link>
        <div className="lp-nav-links">
          <a href="#solution">Our solution</a>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
        </div>
        <div className="right">
          <Link href={signedIn ? "/projects" : "/login"} className="lp-signin">Sign in</Link>
          <Link href="/login?mode=signup" className="lp-btn lp-btn-dark lp-btn-sm">Sign up</Link>
        </div>
      </motion.nav>
    </div>
  );
}

/**
 * Page-wide colour clouds behind everything. They drift slowly on their own, and their colours
 * shift as you scroll: warm sand and cream, with a faint haze of
 * the electric-blue accent drifting through.
 */
export function Ambient() {
  return <div className="lp-ambient" aria-hidden />;
}

export function HeroCopy({ signedIn }: { signedIn: boolean }) {
  const reduce = useReducedMotion();
  const start = signedIn ? "/projects" : "/login?mode=signup";
  const fade = (d: number) => ({
    initial: reduce ? false : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease: EASE, delay: d },
  });
  return (
    <div>
      <motion.p className="lp-pill" {...fade(0)}><b>Beta</b>Shared memory for teams that use different AIs</motion.p>
      <h1><Words text="One memory for your whole team," soft="whatever AI each person uses." delay={0.1} mark={2} /></h1>
      <motion.p className="lp-lede" {...fade(0.75)}>
        Decide something with Claude. Your teammate asks ChatGPT the next day, and it already knows: what was decided, who
        said it, and when.
      </motion.p>
      <motion.div className="lp-ctas" {...fade(0.9)}>
        <Link href={start} className="lp-btn lp-btn-dark">{signedIn ? "Open your projects" : "Start free"}<span className="arrow" aria-hidden>→</span></Link>
        <a href="#how" className="lp-btn lp-btn-light">See how it works</a>
        {!signedIn && <Note className="hero-note" arrow="up" delay={1.6}>two minutes, promise</Note>}
      </motion.div>
      <motion.p className="lp-assure" {...fade(1.05)}>
        <span><Check />Works with Claude and ChatGPT</span>
        <span><Check />Set up in two minutes</span>
        <span><Check />Free during the beta</span>
      </motion.p>
    </div>
  );
}

type Card = { id: string; text: string; kind: Kind; who: Person; status: "checking" | "added" | "flag"; ring?: "glow" | "warn"; shake?: boolean };

const BASE: Card[] = [
  { id: "launch", text: "Launch is planned for 3 March.", kind: "fact", who: "Louis", status: "added" },
  { id: "pricing", text: "Who signs off the pricing page?", kind: "question", who: "Sara", status: "added" },
  { id: "yearly", text: "Most buyers will pay yearly.", kind: "assumption", who: "Maya", status: "added" },
];
const STRIPE = { id: "stripe", text: "Payments go through Stripe Checkout.", kind: "decision" as Kind, who: "Edgar" as Person };
const PAYPAL = { id: "paypal", text: "Let’s switch payments to PayPal.", kind: "decision" as Kind, who: "Sara" as Person };

// One loop of the hero story (ms per step).
const HERO_STEPS = [1400, 1500, 1300, 1700, 2600, 1600, 1300, 1900, 1500, 1200, 2200, 900];

function cardsFor(step: number): Card[] {
  const cards: Card[] = [];
  if (step >= 1 && step <= 10) {
    cards.push({
      ...STRIPE,
      status: step === 1 ? "checking" : "added",
      ring: step === 4 ? "glow" : step >= 7 && step <= 8 ? "warn" : undefined,
      shake: step === 7,
    });
  }
  if (step >= 6 && step <= 8) {
    cards.push({ ...PAYPAL, status: step === 6 ? "checking" : "flag", ring: step >= 7 ? "warn" : undefined, shake: step === 7 });
  }
  return [...cards.reverse(), ...BASE];
}

function MemoryCard({ c }: { c: Card }) {
  const ringColor = c.ring === "glow" ? "var(--decision)" : c.ring === "warn" ? "var(--person)" : "transparent";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1, x: c.shake ? [0, -6, 6, -4, 4, 0] : 0, boxShadow: c.ring ? `0 0 0 2px ${ringColor}, 0 10px 24px -12px ${ringColor}` : "0 6px 16px -12px rgba(27,29,74,.25)" }}
      exit={{ opacity: 0, scale: 0.9, height: 0, marginTop: -9, transition: { duration: 0.45, ease: EASE } }}
      transition={{ layout: { duration: 0.5, ease: EASE }, duration: 0.5, ease: EASE, x: { duration: 0.5 } }}
      className="lp-card"
    >
      <span className="bar" style={{ background: KIND_COLOR[c.kind] }} />
      <div>
        <p className="t">{c.text}</p>
        <p className="m">
          <span className="lp-kind" style={{ color: KIND_COLOR[c.kind] }}>{KIND_LABEL[c.kind]}</span>
          <Who name={c.who} />
          {c.status === "checking" && <span className="lp-status" style={{ color: "var(--fact)" }}><span className="lp-spin" />Checking against Hivetta</span>}
          {c.status === "added" && <span className="lp-status" style={{ color: "var(--decision)" }}><Check size={12} />Added</span>}
          {c.status === "flag" && <span className="lp-status" style={{ color: "var(--person)" }}>Disagrees with a decision</span>}
        </p>
      </div>
    </motion.div>
  );
}

function Bubble({ who, children, reply, className }: { who: Person; children: React.ReactNode; reply?: React.ReactNode; className: string }) {
  return (
    <motion.div
      className={`lp-bubble ${className}`}
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <p className="from"><span className="lp-face" style={{ background: PEOPLE[who].color }}>{who[0]}</span>{who}<span className="tool">{PEOPLE[who].tool}</span></p>
      <p>{children}</p>
      <AnimatePresence>
        {reply && (
          <motion.p className="reply" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            {reply}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function HeroScene() {
  const ref = useRef<HTMLDivElement>(null);
  const step = useScript(ref, HERO_STEPS, 4);
  const cards = cardsFor(step);
  const top = step <= 2 ? "edgar" : step >= 5 && step <= 7 ? "sara" : null;
  const bottom = step >= 3 && step <= 4 ? "louis" : null;

  return (
    <div ref={ref} className="lp-scene" role="img" aria-label="Animated example: Edgar saves a decision from Claude, Louis gets it in ChatGPT, and when Sara contradicts it, a person chooses which one to keep.">
        <Note className="scene-note" arrow="down" color="var(--question)" delay={1.2}>everyone’s AI reads this</Note>
      <div aria-hidden>
        <AnimatePresence mode="popLayout">
          {top === "edgar" && <Bubble key="edgar" who="Edgar" className="b-top">We’re going with Stripe Checkout. Save it to Hivetta.</Bubble>}
          {top === "sara" && <Bubble key="sara" who="Sara" className="b-top">Actually, let’s switch payments to PayPal.</Bubble>}
        </AnimatePresence>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}>
          <div className="lp-window">
            <div className="lp-window-bar">
              <span className="dots"><i /><i /><i /></span>
              <span className="title">Shop relaunch · Hivetta</span>
              <span className="meta">4 people · 2 AIs</span>
            </div>
            <div className="lp-window-body">
              <div className="feed">
                <AnimatePresence initial={false}>
                  {cards.map((c) => <MemoryCard key={c.id} c={c} />)}
                </AnimatePresence>
              </div>
              <AnimatePresence>
                {step >= 7 && step <= 8 && (
                  <motion.div className="lp-decide" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.4, ease: EASE }}>
                    <span className="k">Two decisions disagree. Which one stands?</span>
                    <span className="lp-mini-btn primary" style={{ transform: step === 8 ? "scale(.94)" : undefined, transition: "transform .15s" }}>Keep Stripe</span>
                    <span className="lp-mini-btn">Keep PayPal</span>
                    <motion.span
                      className="lp-cursor"
                      initial={{ right: -30, bottom: -40, opacity: 0 }}
                      animate={{ right: 128, bottom: -4, opacity: 1, scale: step === 8 ? 0.82 : 1 }}
                      transition={{ duration: 1, ease: EASE }}
                    >
                      <Cursor />
                    </motion.span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <AnimatePresence>
              {step >= 9 && step <= 10 && (
                <motion.div className="lp-toast" initial={{ opacity: 0, y: 10, x: "-50%" }} animate={{ opacity: 1, y: 0, x: "-50%" }} exit={{ opacity: 0, x: "-50%" }} transition={{ duration: 0.4, ease: EASE }}>
                  <Check size={13} />Stripe kept. PayPal saved to history, with the reason.
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <AnimatePresence>
          {bottom === "louis" && (
            <Bubble key="louis" who="Louis" className="b-bottom" reply={step === 4 ? <><b style={{ color: "var(--ink)" }}>Stripe Checkout.</b> Decided by Edgar in Claude, today.</> : undefined}>
              What did we decide for payments?
            </Bubble>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

export function KindLegend() {
  const kinds: Kind[] = ["decision", "fact", "assumption", "question"];
  return <span className="lp-works-kinds">{kinds.map((k) => <Chip key={k} kind={k} />)}</span>;
}
