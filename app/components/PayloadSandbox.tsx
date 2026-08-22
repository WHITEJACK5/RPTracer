"use client";

import { useState } from "react";
import { PRESETS, type PresetKey } from "@/lib/api";

const PRESET_META: Record<PresetKey, { accent: string; tag: string }> = {
  normal_upi: { accent: "#00d4aa", tag: "UPI · CLEAN" },
  rto_cod: { accent: "#f97316", tag: "COD · RTO" },
  mule_ring: { accent: "#ef4444", tag: "GRAPH · RING" },
  synthetic_id: { accent: "#a855f7", tag: "IDENTITY" },
};

const ICONS: Record<PresetKey, JSX.Element> = {
  normal_upi: (
    <path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4z" strokeWidth="1.6" />
  ),
  rto_cod: (
    <><rect x="3" y="8" width="13" height="10" rx="1.5" strokeWidth="1.6" />
      <path d="M16 11h3l2 2.5V18h-5" strokeWidth="1.6" />
      <circle cx="7" cy="19" r="1.6" /><circle cx="17.5" cy="19" r="1.6" /></>
  ),
  mule_ring: (
    <><circle cx="12" cy="12" r="2.2" /><circle cx="12" cy="4.5" r="1.8" /><circle cx="4.5" cy="14" r="1.8" />
      <circle cx="19.5" cy="14" r="1.8" /><circle cx="8" cy="20" r="1.8" /><circle cx="16" cy="20" r="1.8" />
      <path d="M12 6.3v3.5M10.2 13L6 13.6M13.8 13l4.2.6M10.8 14l-1.8 4M13.2 14l1.8 4" /></>
  ),
  synthetic_id: (
    <><path d="M12 3a9 9 0 019 9M12 7a5 5 0 015 5M12 11a1 1 0 011 1" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M21 17.5A9 9 0 013 12" strokeWidth="1.7" strokeLinecap="round" opacity="0.5" />
      <path d="M3 12a9 9 0 019-9" strokeWidth="0" /></>
  ),
};

export default function PayloadSandbox({
  onEvaluate,
  evaluating,
}: {
  onEvaluate: (payload: object) => Promise<void>;
  evaluating: boolean;
}) {
  const [activeKey, setActiveKey] = useState<PresetKey | null>("normal_upi");
  const [text, setText] = useState(() => JSON.stringify(PRESETS.normal_upi.payload, null, 2));
  const [error, setError] = useState<string | null>(null);

  function selectPreset(key: PresetKey) {
    setActiveKey(key);
    setError(null);
    setText(JSON.stringify(PRESETS[key].payload, null, 2));
  }

  async function send() {
    try {
      const payload = JSON.parse(text);
      setError(null);
      await onEvaluate(payload);
    } catch (e) {
      setError(e instanceof SyntaxError ? `Invalid JSON: ${e.message}` : String(e));
    }
  }

  return (
    <section className="glass flex flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-grotesk text-sm font-semibold tracking-widest text-white/50">
          PAYLOAD SANDBOX
        </h2>
        <span className="font-mono text-[10px] text-white/35">POST /api/v1/risk/evaluate</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(PRESETS) as PresetKey[]).map((key) => {
          const meta = PRESET_META[key];
          const active = activeKey === key;
          return (
            <button
              key={key}
              onClick={() => selectPreset(key)}
              className={`group rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${
                active ? "bg-white/[0.05]" : "border-line bg-white/[0.02] hover:bg-white/[0.045]"
              }`}
              style={active ? { borderColor: `${meta.accent}66`, boxShadow: `0 0 18px -6px ${meta.accent}88` } : undefined}
            >
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" fill="none" stroke={meta.accent} className="h-5 w-5 shrink-0"
                     strokeLinecap="round" strokeLinejoin="round">
                  {ICONS[key]}
                </svg>
                <div className="min-w-0">
                  <p className="truncate font-grotesk text-[13px] font-semibold text-white/90">
                    {PRESETS[key].label}
                  </p>
                  <p className="font-mono text-[9px] tracking-wider" style={{ color: meta.accent }}>
                    {meta.tag} → {PRESETS[key].expected_band}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-white/45">{activeKey && PRESETS[activeKey].description}</p>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActiveKey(null);
        }}
        spellCheck={false}
        rows={14}
        className="terminal-scroll mt-3 w-full flex-1 resize-none rounded-xl border border-line bg-black/40 p-3.5 font-mono text-[11.5px] leading-relaxed text-teal-glow/90 outline-none transition focus:border-teal-glow/40 focus:glow-teal"
      />

      {error && (
        <p className="mt-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
          {error}
        </p>
      )}

      <button
        onClick={send}
        disabled={evaluating}
        className="group relative mt-3 overflow-hidden rounded-xl py-3 font-grotesk text-sm font-bold tracking-wide text-black transition disabled:opacity-60"
        style={{ background: "linear-gradient(92deg,#00d4aa,#5eead4 40%,#a855f7)" }}
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          {evaluating ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="rgba(0,0,0,0.25)" strokeWidth="3" />
                <path d="M21 12a9 9 0 00-9-9" stroke="#000" strokeWidth="3" strokeLinecap="round" />
              </svg>
              SCORING…
            </>
          ) : (
            <>
              RUN RISK ENGINE
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </span>
      </button>
    </section>
  );
}
