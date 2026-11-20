"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#8fbfa9", "#9db4cc", "#c9a3c6", "#e09a83"];

/**
 * A slowly drifting web of coloured dots (memories). Nearby ones link up, and every
 * so often a spark travels along a link: a memory passing from one person to another.
 * Static when the visitor prefers reduced motion; paused when the tab is hidden.
 */
export function MemoryField({ density = 1 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    type Node = { x: number; y: number; vx: number; vy: number; r: number; c: string };
    type Spark = { a: Node; b: Node; t: number };
    let nodes: Node[] = [];
    let sparks: Spark[] = [];
    let w = 0, h = 0, raf = 0, last = 0, nextSpark = 0;
    const LINK = 150;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(80, (w * h) / 16000) * density);
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12,
        r: 1.4 + Math.random() * 2.2, c: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      }));
      sparks = [];
    };

    const draw = (now: number) => {
      const dt = Math.min(48, now - (last || now)); last = now;
      ctx.clearRect(0, 0, w, h);
      for (const n of nodes) {
        if (!reduce) {
          n.x += n.vx * dt * 0.06 * 16 / 16; n.y += n.vy * dt * 0.06;
          if (n.x < -20) n.x = w + 20; if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20; if (n.y > h + 20) n.y = -20;
        }
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]!, b = nodes[j]!;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(150,160,230,${(1 - d / LINK) * 0.16})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        ctx.fillStyle = n.c; ctx.globalAlpha = 0.75;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.12;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce) {
        if (now > nextSpark && nodes.length > 1) {
          nextSpark = now + 700 + Math.random() * 900;
          const a = nodes[Math.floor(Math.random() * nodes.length)]!;
          const near = nodes.filter((b) => b !== a && Math.hypot(a.x - b.x, a.y - b.y) < LINK);
          const b = near[Math.floor(Math.random() * near.length)];
          if (b) sparks.push({ a, b, t: 0 });
        }
        sparks = sparks.filter((s) => (s.t += dt / 1100) < 1);
        for (const s of sparks) {
          const x = s.a.x + (s.b.x - s.a.x) * s.t, y = s.a.y + (s.b.y - s.a.y) * s.t;
          ctx.fillStyle = s.a.c; ctx.globalAlpha = Math.sin(Math.PI * s.t);
          ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        raf = requestAnimationFrame(draw);
      }
    };

    resize();
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(() => { resize(); if (reduce) draw(performance.now()); });
    ro.observe(canvas);
    const vis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) { last = 0; raf = requestAnimationFrame(draw); }
    };
    document.addEventListener("visibilitychange", vis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, [density]);

  return <canvas ref={ref} className="hero-field" aria-hidden />;
}
