"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

export type Kind = "decision" | "fact" | "assumption" | "question" | "person";
export const KIND_COLOR: Record<Kind, string> = {
  decision: "var(--decision)",
  fact: "var(--fact)",
  assumption: "var(--assumption)",
  question: "var(--question)",
  person: "var(--person)",
};
export const KIND_LABEL: Record<Kind, string> = {
  decision: "Decision",
  fact: "Fact",
  assumption: "Assumption",
  question: "Open question",
  person: "Needs a person",
};
export const PEOPLE = {
  Edgar: { color: "#2f5d50", tool: "Claude" },
  Louis: { color: "#3e5c7e", tool: "ChatGPT" },
  Sara: { color: "#b5573b", tool: "Claude" },
  Maya: { color: "#7a4e7a", tool: "ChatGPT" },
} as const;
export type Person = keyof typeof PEOPLE;

export const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Plays a scripted scene: returns the current step, advancing through `durations` (ms) while the
 * element is on screen, then looping. With reduced motion it holds `still` forever.
 */
export function useScript(ref: RefObject<Element | null>, durations: number[], still: number) {
  const reduce = useReducedMotion();
  const inView = useInView(ref, { amount: 0.35 });
  const [step, setStep] = useState(reduce ? still : 0);
  useEffect(() => {
    if (reduce) { setStep(still); return; }
    if (!inView) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % durations.length), durations[step] ?? 1500);
    return () => clearTimeout(t);
  }, [step, inView, reduce, durations, still]);
  return step;
}

/** Headline that rises word by word, from a soft blur to sharp. */
export function Words({ text, className, delay = 0, soft, mark = 0 }: { text: string; className?: string; delay?: number; soft?: string; mark?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const words = text.split(" ");
  const softWords = soft ? soft.split(" ") : [];
  const all = [...words.map((w) => ({ w, s: false })), ...softWords.map((w) => ({ w, s: true }))];
  return (
    <span ref={ref} className={className} aria-label={soft ? `${text} ${soft}` : text}>
      {all.map(({ w, s }, i) => (
        <motion.span
          key={i}
          aria-hidden
          className={`lp-word${s ? " soft" : ""}${i < mark ? " mark" : ""}`}
          initial={reduce ? false : { opacity: 0, y: "0.45em", filter: "blur(8px)" }}
          animate={inView || reduce ? { opacity: 1, y: 0, filter: "blur(0px)" } : undefined}
          transition={{ duration: 0.7, ease: EASE, delay: delay + i * 0.055 }}
        >
          {w}{i < all.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </span>
  );
}

/** Fades and settles content into place once, when scrolled into view. */
export function Rise({ children, delay = 0, className, y = 24 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

export function Face({ name }: { name: Person }) {
  return <span className="lp-face" style={{ background: PEOPLE[name].color }}>{name[0]}</span>;
}

export function Who({ name, tool }: { name: Person; tool?: string }) {
  return <span className="lp-who"><Face name={name} />{name} in {tool ?? PEOPLE[name].tool}</span>;
}

export function Chip({ kind }: { kind: Kind }) {
  return (
    <span className="lp-chip" style={{ color: KIND_COLOR[kind], background: `color-mix(in srgb, ${KIND_COLOR[kind]} 13%, white)` }}>
      <span className="dot" />{KIND_LABEL[kind]}
    </span>
  );
}

export function Window({ title, meta, children, className, style }: { title: string; meta?: ReactNode; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`lp-window ${className ?? ""}`} style={style}>
      <div className="lp-window-bar">
        <span className="dots"><i /><i /><i /></span>
        <span className="title">{title}</span>
        {meta && <span className="meta">{meta}</span>}
      </div>
      <div className="lp-window-body">{children}</div>
    </div>
  );
}

export function Cursor() {
  return (
    <svg viewBox="0 0 24 24" className="lp-cursor-svg" width="22" height="22" aria-hidden>
      <path d="M4 2l16 9-7 2-3 7z" fill="#2a1f1f" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Check({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

export function Icon({ d, size = 18 }: { d: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  );
}

/** A number that counts up from zero when it comes into view. */
export function CountUp({ to, className }: { to: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? to : 0);
  useEffect(() => {
    if (!inView || reduce) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / 1200));
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, to]);
  return <span ref={ref} className={className}>{n}</span>;
}

/** A handwritten margin note with a hand-drawn arrow that draws itself in. */
export function Note({ children, className, arrow = "left", color = "var(--accent)", delay = 0.4 }: { children: ReactNode; className?: string; arrow?: "left" | "down" | "right" | "up"; color?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.8 });
  const paths: Record<string, { d: string; head: string; box: string; w: number; h: number }> = {
    left: { d: "M58 8 C40 4 18 10 6 26", head: "M4 14 L6 26 L18 24", box: "0 0 64 32", w: 64, h: 32 },
    down: { d: "M10 4 C30 10 40 26 34 52", head: "M24 44 L34 52 L40 41", box: "0 0 48 58", w: 48, h: 58 },
    right: { d: "M6 8 C24 4 46 10 58 26", head: "M46 24 L58 26 L60 14", box: "0 0 64 32", w: 64, h: 32 },
    up: { d: "M30 54 C20 40 18 22 26 6", head: "M16 14 L26 6 L33 16", box: "0 0 48 58", w: 48, h: 58 },
  };
  const a = paths[arrow]!;
  const draw = { initial: reduce ? false : { pathLength: 0 }, animate: inView || reduce ? { pathLength: 1 } : undefined };
  const svg = (
    <svg width={a.w} height={a.h} viewBox={a.box} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <motion.path d={a.d} {...draw} transition={{ duration: 0.7, ease: EASE, delay }} />
      <motion.path d={a.head} {...draw} transition={{ duration: 0.25, ease: EASE, delay: delay + 0.65 }} />
    </svg>
  );
  return (
    <motion.span ref={ref} className={`lp-hand ${className ?? ""} a-${arrow}`} style={{ color }}
      initial={reduce ? false : { opacity: 0, rotate: -4 }} animate={inView || reduce ? { opacity: 1, rotate: -3 } : undefined} transition={{ duration: 0.5, delay }}>
      {(arrow === "left" || arrow === "up") && svg}
      <span className="txt">{children}</span>
      {(arrow === "right" || arrow === "down") && svg}
    </motion.span>
  );
}
