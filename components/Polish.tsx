"use client";

import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Animates a number from its previous value to `value` (ease-out, ~700ms). */
export function CountUp({ value, suffix = "", duration = 700 }: { value: number; suffix?: string; duration?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const current = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      from.current = current.current = value;
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      current.current = origin + (value - origin) * eased;
      setShown(current.current);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      // Resume from what is on screen (also keeps Strict Mode's effect re-run animating).
      from.current = current.current;
    };
  }, [value, duration]);

  return (
    <span className="tabular-nums" aria-label={`${value}${suffix}`}>
      {Math.round(shown)}
      {suffix}
    </span>
  );
}

const CONFETTI_COLORS = ["#4f46e5", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];

/** A small celebratory burst from an element (or the screen centre). Skipped for reduced motion. */
export function burstConfetti(from?: Element | null, pieces = 36) {
  if (typeof document === "undefined" || prefersReducedMotion()) return;
  const rect = from?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
  for (let i = 0; i < pieces; i++) {
    const el = document.createElement("span");
    el.className = "confetti-piece";
    const angle = Math.random() * Math.PI - Math.PI; // upward half-circle
    const distance = 80 + Math.random() * 140;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${6 + Math.random() * 5}px`;
    el.style.height = `${8 + Math.random() * 6}px`;
    el.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    el.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    el.style.setProperty("--dy", `${Math.sin(angle) * distance + 120}px`);
    el.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    el.style.animationDelay = `${Math.random() * 80}ms`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }
}

/** Placeholder rows shown while a filtered list is being recomputed. */
export function SkeletonRows({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-slate-100" aria-busy="true" aria-label="Loading results">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-slate-200/70" />
          {Array.from({ length: columns }, (_, c) => (
            <span
              key={c}
              className="h-3 animate-pulse rounded bg-slate-200/70"
              style={{ width: `${c === 0 ? 22 : 10 + ((r * 7 + c * 13) % 12)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
