"use client";

import { useEffect, useRef, useState } from "react";
import type { RiskEvaluation } from "@/lib/types";

const BAND_STYLE: Record<string, { color: string; label: string }> = {
  LOW: { color: "var(--chart-low)", label: "LOW RISK" },
  MEDIUM: { color: "var(--chart-med)", label: "MEDIUM RISK" },
  HIGH: { color: "var(--chart-high)", label: "HIGH RISK" },
};

function useCountUp(target: number, duration = 850) {
  const [val, setVal] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val;
}

/** Semicircular risk gauge with SHAP contribution bars. */
export default function RiskGauge({ result }: { result: RiskEvaluation | null }) {
  const score = useCountUp(result?.risk_score ?? 0);
  const band = result ? BAND_STYLE[result.risk_band] : null;
  const C = Math.PI * 88;
  const maxAbs = result
    ? Math.max(...result.top_factors.map((f) => Math.abs(f.contribution)), 1)
    : 1;

  return (
    <section className="glass flex flex-col p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-grotesk text-sm font-semibold tracking-widest text-text-muted">RISK SCORE · SHAP ATTRIBUTION</h2>
        {result && <span className="font-mono text-[10px] text-text-muted">{result.model_version}</span>}
      </div>

      <div className="relative mx-auto w-full max-w-[300px]">
        <svg viewBox="0 0 220 132" className="w-full">
          <defs>
            <linearGradient id="gaugeGrad" x1="0" y1="0" x2="220" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="var(--chart-low)" />
              <stop offset="55%" stopColor="var(--chart-med)" />
              <stop offset="100%" stopColor="var(--chart-high)" />
            </linearGradient>
          </defs>
          <path d="M22 112 A88 88 0 0 1 198 112" stroke="var(--color-border)" strokeWidth="13" fill="none" strokeLinecap="round" />
          <path
            d="M22 112 A88 88 0 0 1 198 112"
            stroke="url(#gaugeGrad)"
            strokeWidth="13" fill="none" strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={result ? C * (1 - score / 100) : C}
            style={{ transition: "stroke-dashoffset 120ms linear", filter: "drop-shadow(0 0 10px var(--shadow-gold))" }}
          />
          {result && (() => {
            const a = Math.PI * (score / 100);
            const x = 110 - 74 * Math.cos(a);
            const y = 112 - 74 * Math.sin(a);
            return <circle cx={x} cy={y} r="5.5" fill="var(--color-text-primary)" stroke={band!.color} strokeWidth="3" />;
          })()}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-1">
          <div className="font-grotesk text-6xl font-bold leading-none" style={{ color: band?.color ?? "var(--color-text-muted)" }}>
            {result ? score : "--"}
          </div>
          <div className={`mt-1.5 chip ${!result && "opacity-30"}`}
            style={{ color: band?.color ?? undefined, borderColor: band ? `${band.color}` : undefined }}>
            {band?.label ?? "AWAITING SCAN"}
          </div>
        </div>
      </div>

      {result && (
        <div className="mt-3 rounded-md border px-3.5 py-2.5 font-mono text-xs"
          style={{ borderColor: `${band!.color}`, background: "color-mix(in srgb, var(--color-danger) 8%, transparent)", color: band!.color }}>
          DECISION → {result.decision}
          {result.idempotent_replay && <span className="ml-2 text-text-muted">(idempotent replay)</span>}
        </div>
      )}

      <div className="mt-4 flex-1">
        <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-text-muted">
          <span>Top factors</span><span>push on score</span>
        </div>
        {!result || result.top_factors.length === 0 ? (
          <p className="py-6 text-center font-mono text-[11px] text-text-muted">Trigger a payload to decompose the score.</p>
        ) : (
          <ul className="space-y-2">
            {result.top_factors.map((f) => {
              const pct = (Math.abs(f.contribution) / maxAbs) * 50;
              const up = f.direction === "RISK_UP";
              return (
                <li key={f.feature} className="group grid grid-cols-[minmax(0,1fr)_150px_46px] items-center gap-2">
                  <span className="truncate text-xs text-text-secondary group-hover:text-text-primary">{f.label}</span>
                  <span className="relative h-2 overflow-hidden rounded-full bg-bg-tertiary">
                    <span
                      className={`absolute top-0 h-full rounded-full ${up ? "left-1/2" : "right-1/2"}`}
                      style={{
                        width: `${pct}%`,
                        background: up ? "linear-gradient(90deg,var(--chart-med),var(--chart-high))" : "linear-gradient(90deg,var(--chart-low),var(--color-ok))",
                        boxShadow: `0 0 8px ${up ? "var(--chart-high)" : "var(--chart-low)"}`,
                      }}
                    />
                    <span className="absolute left-1/2 top-[-2px] h-3 w-px bg-border-strong" />
                  </span>
                  <span className={`text-right font-mono text-[11px] ${up ? "text-danger" : "text-neon-green"}`}>
                    {f.contribution > 0 ? "+" : ""}{f.contribution.toFixed(1)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {result && (
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 font-mono text-[10px] text-text-muted">
          <span>{result.audit_ref.slice(0, 26)}…</span>
          <span className="flex-1" />
          <span className={result.latency_ms <= 50 ? "text-neon-green" : "text-gold-500"}>{result.latency_ms.toFixed(1)}ms pipeline</span>
        </div>
      )}
    </section>
  );
}
