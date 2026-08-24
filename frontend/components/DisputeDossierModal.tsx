"use client";

import { useState } from "react";
import type { DisputeDossier } from "@/lib/types";
import GoldButton from "./ui/GoldButton";

/** Modal presenting a generated dispute dossier with copy-to-clipboard. */
export default function DisputeDossierModal({ dossier, onClose }: { dossier: DisputeDossier | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!dossier) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(dossier, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="glass relative max-h-[88vh] w-full max-w-3xl overflow-y-auto terminal-scroll p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-gold-400">DISPUTE DOSSIER · {dossier.dossier_id}</p>
            <h3 className="mt-1 font-grotesk text-xl font-bold text-text-primary">{dossier.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={`chip font-mono !text-[10px] ${dossier.generated_by === "llm" ? "!border-gold-500/40 !text-gold-400" : ""}`}>
              {dossier.generated_by === "llm" ? "GPT-4o-mini" : "TEMPLATE ENGINE"}
            </span>
            <button onClick={onClose} className="rounded-md border border-border px-2.5 py-1.5 font-mono text-xs text-text-secondary hover:bg-bg-tertiary">ESC</button>
          </div>
        </div>

        <p className="rounded-md border border-border bg-bg-tertiary/40 p-4 text-sm leading-relaxed text-text-secondary">{dossier.executive_summary}</p>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <h4 className="mb-2 font-mono text-[10px] tracking-[0.18em] text-text-muted">EVIDENCE ARTIFACTS</h4>
            <ul className="space-y-2">
              {dossier.evidence.map((e, i) => (
                <li key={i} className="flex gap-2 rounded-md border border-border bg-bg-primary/30 px-3 py-2 text-[12px] leading-snug text-text-secondary">
                  <span className="font-mono text-neon-green">{String(i + 1).padStart(2, "0")}</span><span>{e}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-2 font-mono text-[10px] tracking-[0.18em] text-text-muted">REASON CODES</h4>
            <div className="flex flex-wrap gap-1.5">
              {dossier.shap_reason_codes.map((c) => (
                <span key={c} className="chip font-mono !text-[10px] !border-danger/30 !text-danger/90">{c}</span>
              ))}
            </div>
            <h4 className="mb-2 mt-4 font-mono text-[10px] tracking-[0.18em] text-text-muted">BOUNDED ACTIONS</h4>
            <ul className="space-y-1.5">
              {dossier.recommended_actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-text-secondary">
                  <svg viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="var(--color-neon-green)" strokeWidth="1.8">
                    <path d="M3 8.5l3.2 3L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-5 border-t border-border pt-4 font-mono text-[10.5px] leading-relaxed text-text-muted">⚖ {dossier.regulatory_note}</p>

        <GoldButton onClick={copy} variant="secondary" className="mt-4 w-full">
          {copied ? "COPIED TO CLIPBOARD ✓" : "COPY DOSSIER JSON"}
        </GoldButton>
      </div>
    </div>
  );
}
