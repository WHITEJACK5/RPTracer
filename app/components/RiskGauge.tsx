"use client";

import { useEffect, useRef, useState } from "react";
import type { RiskEvaluation } from "@/lib/types";

const BAND_STYLE: Record<string, { color: string; label: string }> = {
  LOW: { color: "#00d4aa", label: "LOW RISK" },
  MEDIUM: { color: "#f97316", label: "MEDIUM RISK" },
  HIGH: { color: "#ef4444", label: "HIGH RISK" },
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

export default function RiskGauge({ result }: { result: RiskEvaluation | null }) {
  const score = useCountUp(result?.risk_score ?? 0);
  const band = result ? BAND_STYLE[result.risk_band] : null;
  const C = Math.PI * 88; // semicircle length

  const maxAbs = result
    ? Math.max(...result.top_factors.map((f) => Math.abs(f.contribution)), 1)
    : 1;

  return (
    <section className="glass flex flex-col p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-grotesk text-sm font-semibold tracking-widest text-white/50">
          RISK SCORE · SHAP ATTRIBUTION
        </h2>
        {result && (
          <span className="font-mono text-[10px] text-white/40">{result.model_version}</span>
        )}
      </div>

      {/* Gauge */}
      <div className="relative mx-auto w-full max-w-[300px]">
        <svg viewBox="0 0 220 132" className="w-full">
          <defs>
            <linearGradient id="gaugeGrad" x1="0" y1="0" x2="220" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#00d4aa" />
              <stop offset="55%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          <path d="M22 112 A88 88 0 0 1 198 112" stroke="rgba(255,255,255,0.07)" strokeWidth="13" fill="none" strokeLinecap="round" />
          <path
            d="M22 112 A88 88 0 0 1 198 112"
            stroke="url(#gaugeGrad)"
            strokeWidth="13"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={result ? C * (1 - score / 100) : C}
            style={{ transition: "stroke-dashoffset 120ms linear", filter: "drop-shadow(0 0 10px rgba(0,212,170,0.35))" }}
          />
          {result && (() => {
            const a = Math.PI * (score / 100);
            const x = 110 - 74 * Math.cos(a);
            const y = 112 - 74 * Math.sin(a);
            return <circle cx={x} cy={y} r="5.5" fill="#fff" stroke={band!.color} strokeWidth="3" />;
          })()}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-1">
          <div className="font-grotesk text-6xl font-bold leading-none" style={{ color: band?.color ?? "rgba(255,255,255,0.25)" }}>
            {result ? score : "--"}
          </div>
          <div className={`mt-1.5 chip ${!result && "opacity-30"}`}
               style={{ color: band?.color ?? undefined, borderColor: band ? `${band.color}44` : undefined }}>
            {band?.label ?? "AWAITING SCAN"}
          </div>
        </div>
      </div>

      {/* Decision */}
      {result && (
        <div className="mt-3 rounded-xl border px-3.5 py-2.5 font-mono text-xs"
             style={{
               borderColor: `${band!.color}33`,
               background: `${band!.color}0d`,
               color: band!.color,
             }}>
          DECISION → {result.decision}
          {result.idempotent_replay && <span className="ml-2 text-white/40">(idempotent replay)</span>}
        </div>
      )}

      {/* SHAP bars */}
      <div className="mt-4 flex-1">
        <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-white/35">
          <span>Top factors</span><span>push on score</span>
        </div>
        {!result || result.top_factors.length === 0 ? (
          <p className="py-6 text-center font-mono text-[11px] text-white/25">
            Trigger a payload to decompose the score.
          </p>
        ) : (
          <ul className="space-y-2">
            {result.top_factors.map((f) => {
              const pct = (Math.abs(f.contribution) / maxAbs) * 50;
              const up = f.direction === "RISK_UP";
              return (
                <li key={f.feature} className="group grid grid-cols-[minmax(0,1fr)_150px_46px] items-center gap-2">
                  <span className="truncate text-xs text-white/65 group-hover:text-white">{f.label}</span>
                  <span className="relative h-2 overflow-hidden rounded-full bg-white/[0.05]">
                    <span
                      className={`absolute top-0 h-full rounded-full ${up ? "left-1/2" : "right-1/2"}`}
                      style={{
                        width: `${pct}%`,
                        background: up
                          ? "linear-gradient(90deg,#f97316,#ef4444)"
                          : "linear-gradient(90deg,#00d4aa,#34c759)",
                        boxShadow: `0 0 8px ${up ? "rgba(239,68,68,.45)" : "rgba(0,212,170,.45)"}`,
                      }}
                    />
                    <span className="absolute left-1/2 top-[-2px] h-3 w-px bg-white/20" />
                  </span>
                  <span className={`text-right font-mono text-[11px] ${up ? "text-danger" : "text-teal-glow"}`}>
                    {f.contribution > 0 ? "+" : ""}{f.contribution.toFixed(1)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {result && (
        <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 font-mono text-[10px] text-white/35">
          <span>{result.audit_ref.slice(0, 26)}…</span>
          <span className="flex-1" />
          <span className={result.latency_ms <= 50 ? "text-teal-glow" : "text-warn"}>
            {result.latency_ms.toFixed(1)}ms pipeline
          </span>
        </div>
      )}
    </section>
  );
}
