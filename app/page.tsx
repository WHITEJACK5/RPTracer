"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "./components/Navbar";
import PayloadSandbox from "./components/PayloadSandbox";
import RiskGauge from "./components/RiskGauge";
import AgentTerminal from "./components/AgentTerminal";
import GraphCanvas from "./components/GraphCanvas";
import DisputeDossierModal from "./components/DisputeDossierModal";
import { evaluateRisk, fetchPresets, PRESETS } from "@/lib/api";
import type { Preset, RiskEvaluation } from "@/lib/types";

export default function Page() {
  const [result, setResult] = useState<RiskEvaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [topoCenter, setTopoCenter] = useState<string | null>("DEV-MULE-RING-01");
  const [topoRefresh, setTopoRefresh] = useState(0);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [presets, setPresets] = useState<Record<string, Preset>>(PRESETS);

  // single source of truth: hydrate sandbox presets from the backend
  useEffect(() => {
    let alive = true;
    fetchPresets().then((p) => {
      if (alive && p) setPresets(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleEvaluate = useCallback(async (payload: object) => {
    setEvaluating(true);
    setApiError(null);
    try {
      const { data, replay } = await evaluateRisk(payload);
      setResult({ ...data, idempotent_replay: replay });
      setDossierOpen(Boolean(data.dispute_dossier));
      const ctx = (payload as { context?: { device_id?: string } }).context;
      setTopoCenter(ctx?.device_id ?? null);
      setTopoRefresh((n) => n + 1);
      setRunKey((k) => k + 1);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setEvaluating(false);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDossierOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Navbar lastLatency={result?.latency_ms ?? null} />

      <main className="mx-auto max-w-[1500px] px-5 pb-14 pt-8">
        {/* Hero */}
        <section className="mb-8 flex flex-col items-start gap-3">
          <span className="chip font-mono !text-[10px] tracking-[0.22em] !border-violet-glow/30 !text-violet-glow/90">
            DEFENSE-ONLY AUTONOMOUS RISK ENGINE
          </span>
          <h1 className="font-grotesk text-4xl font-bold leading-[1.05] tracking-tight text-white md:text-[44px]">
            Mule rings don&apos;t hide
            <br />
            from <span className="text-gradient">topology.</span>
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-white/50">
            TRACER links devices, VPAs, cards and IPs into a live entity graph,
            detects abuse-ring fan-out in milliseconds, and hands the case to a
            bounded agent that can only approve, challenge or hold — every action
            written to a hash-chained ledger.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <span className="chip font-mono !text-[10px] text-teal-glow/90">◆ XGBoost GBDT + SHAP</span>
            <span className="chip font-mono !text-[10px] text-violet-glow/90">◆ MULE-RING GRAPH ENGINE</span>
            <span className="chip font-mono !text-[10px] text-white/60">◆ BOUNDED AGENT STATE MACHINE</span>
            <span className="chip font-mono !text-[10px] text-white/60">◆ SUB-50ms SLA</span>
            <span className="chip font-mono !text-[10px] text-white/60">◆ DOUBLE-ENTRY LEDGER</span>
          </div>
        </section>

        {apiError && (
          <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 font-mono text-xs text-danger">
            ENGINE UNREACHABLE → {apiError}
            <span className="ml-2 text-white/40">— is uvicorn running on :8000?</span>
          </div>
        )}

        {/* Dashboard grid */}
        <div className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)]">
          <PayloadSandbox presets={presets} onEvaluate={handleEvaluate} evaluating={evaluating} />

          <div className="flex min-w-0 flex-col gap-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
              <RiskGauge result={result} />
              <AgentTerminal trace={result?.trace ?? null} runKey={runKey} />
            </div>
            <GraphCanvas center={topoCenter} refreshToken={topoRefresh} />
          </div>
        </div>

        <footer className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-5 font-mono text-[10px] tracking-wide text-white/30">
          <span className="font-grotesk font-bold text-white/45">TRACER v1.0</span>
          <span>RAZORPAY AI BUILDATHON 2026 · TRACK 2</span>
          <span>DEFENSE-ONLY COMPLIANT</span>
          <span className="flex-1" />
          <span>FASTAPI · XGBOOST · NETWORKX/NEO4J · NEXT.JS 14</span>
        </footer>
      </main>

      <DisputeDossierModal
        dossier={dossierOpen ? result?.dispute_dossier ?? null : null}
        onClose={() => setDossierOpen(false)}
      />
    </>
  );
}
