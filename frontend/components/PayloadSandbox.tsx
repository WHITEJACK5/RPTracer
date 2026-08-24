"use client";

import { useEffect, useState } from "react";
import { PRESETS } from "@/lib/api";
import type { Preset } from "@/lib/types";
import GoldButton from "./ui/GoldButton";

const ACCENTS: Record<string, string> = {
  normal_upi: "var(--color-neon-green)",
  rto_cod: "var(--color-gold-500)",
  mule_ring: "var(--color-danger)",
  synthetic_id: "var(--color-gold-400)",
};

const TAGS: Record<string, string> = {
  normal_upi: "UPI · CLEAN",
  rto_cod: "COD · RTO",
  mule_ring: "GRAPH · RING",
  synthetic_id: "IDENTITY",
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      className="h-5 w-5 shrink-0" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  );
}

const ICON_PATHS: Record<string, string> = {
  normal_upi: `<path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4z" stroke-width="1.6"/>`,
  rto_cod: `<rect x="3" y="8" width="13" height="10" rx="1.5" stroke-width="1.6"/><path d="M16 11h3l2 2.5V18h-5" stroke-width="1.6"/><circle cx="7" cy="19" r="1.6"/><circle cx="17.5" cy="19" r="1.6"/>`,
  mule_ring: `<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="4.5" r="1.8"/><circle cx="4.5" cy="14" r="1.8"/><circle cx="19.5" cy="14" r="1.8"/><circle cx="8" cy="20" r="1.8"/><circle cx="16" cy="20" r="1.8"/><path d="M12 6.3v3.5M10.2 13L6 13.6M13.8 13l4.2.6M10.8 14l-1.8 4M13.2 14l1.8 4"/>`,
  synthetic_id: `<path d="M12 3a9 9 0 019 9M12 7a5 5 0 015 5M12 11a1 1 0 011 1" stroke-width="1.7"/><path d="M21 17.5A9 9 0 013 12" stroke-width="1.7" opacity="0.5"/><circle cx="12" cy="12" r="3.2" stroke-width="1.4"/>`,
};
const FALLBACK_ICON = `<path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4z" stroke-width="1.6"/>`;

/** Payload editor + preset picker that POSTs to the risk engine. */
export default function PayloadSandbox({
  presets,
  onEvaluate,
  evaluating,
}: {
  presets: Record<string, Preset>;
  onEvaluate: (payload: object) => Promise<void>;
  evaluating: boolean;
}) {
  const [activeKey, setActiveKey] = useState<string | null>("normal_upi");
  const [text, setText] = useState(
    () =>
      JSON.stringify(
        (presets ?? PRESETS)[Object.keys(presets ?? PRESETS)[0]]?.payload ??
          PRESETS.normal_upi.payload,
        null,
        2
      )
  );
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"api" | "bundled">("bundled");

  useEffect(() => {
    if (presets && Object.keys(presets).length) {
      setSource("api");
      const firstKey = Object.keys(presets)[0];
      setActiveKey(firstKey);
      setText(JSON.stringify(presets[firstKey].payload, null, 2));
    }
  }, [presets]);

  function selectPreset(key: string) {
    setActiveKey(key);
    setError(null);
    setText(JSON.stringify((presets[key] ?? PRESETS[key]).payload, null, 2));
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
        <h2 className="font-grotesk text-sm font-semibold tracking-widest text-text-muted">PAYLOAD SANDBOX</h2>
        <span className="font-mono text-[10px] text-text-muted">POST /api/v1/risk/evaluate</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {Object.entries(presets).map(([key, preset]) => {
          const accent = ACCENTS[key] ?? "var(--color-neon-green)";
          const tag = TAGS[key] ?? key.toUpperCase();
          const active = activeKey === key;
          return (
            <button
              key={key}
              onClick={() => selectPreset(key)}
              className={`group rounded-md border px-3 py-2.5 text-left transition-all duration-200 ${
                active ? "bg-bg-tertiary" : "border-border bg-bg-tertiary/40 hover:bg-bg-tertiary"
              }`}
              style={active ? { borderColor: `${accent}`, boxShadow: `0 0 18px -6px ${accent}` } : undefined}
            >
              <div className="flex items-center gap-2">
                <span style={{ color: accent }}><Icon d={ICON_PATHS[key] ?? FALLBACK_ICON} /></span>
                <div className="min-w-0">
                  <p className="truncate font-grotesk text-[13px] font-semibold text-text-primary">{preset.label}</p>
                  <p className="truncate font-mono text-[9px] tracking-wider" style={{ color: accent }}>{tag} → {preset.expected_band}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-text-secondary">
        {activeKey ? presets[activeKey]?.description : "Custom payload — edit and run."}
      </p>

      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setActiveKey(null); }}
        spellCheck={false}
        rows={14}
        className="terminal-scroll mt-3 w-full flex-1 resize-none rounded-md border border-border bg-bg-primary/40 p-3.5 font-mono text-[11.5px] leading-relaxed text-neon-green/90 outline-none transition focus:border-gold-500 focus:shadow-gold"
      />

      {error && (
        <p className="mt-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">{error}</p>
      )}

      <GoldButton onClick={send} disabled={evaluating} className="mt-3 w-full">
        {evaluating ? "SCORING…" : "RUN RISK ENGINE"}
      </GoldButton>

      <p className="mt-2 text-right font-mono text-[9px] tracking-wider text-text-muted">
        presets: {source === "api" ? "GET /api/v1/presets" : "bundled fallback"}
      </p>
    </section>
  );
}
