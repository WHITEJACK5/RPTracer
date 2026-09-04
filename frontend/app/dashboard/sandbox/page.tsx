"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEvaluate } from "@/hooks/useApi";
import { evaluateRisk } from "@/lib/api";
import { queryKeys } from "@/hooks/useApi";
import Button from "@/components/ui/Button";
import ErrorState from "@/components/ui/ErrorState";
import Loader from "@/components/ui/Loader";
import TextReveal from "@/components/ui/TextReveal";
import type { RiskEvaluation, Preset } from "@/lib/types";
import { cn } from "@/lib/utils";

const BUILTIN_PRESETS: Preset[] = [
  {
    label: "Normal UPI",
    description: "Clean domestic transfer — expected LOW",
    expected_band: "LOW",
    payload: {
      event_id: `sandbox_norm_${Date.now()}`,
      amount: 2500.0,
      instrument: { method: "upi", vpa: "user.normal@upi" },
      customer: {
        id: "cust_norm", new_customer: false, account_age_days: 800,
        rto_rate_history: 0.0,
      },
      context: {
        device_id: `DEV-NORMAL-${Date.now()}`,
        ip: "103.25.45.12",
        txn_count_1h: 1,
        txn_count_24h: 3,
        amount_sum_24h: 7500,
        distinct_devices_24h: 1,
        hour_of_day: 14,
      },
    },
  },
  {
    label: "RTO / COD Pattern",
    description: "High RTO history, COD checkout — expected MEDIUM+",
    expected_band: "MEDIUM",
    payload: {
      event_id: `sandbox_rto_${Date.now()}`,
      amount: 8999.0,
      instrument: { method: "cod" },
      customer: {
        id: "cust_rto", new_customer: false, account_age_days: 45,
        rto_rate_history: 0.55,
      },
      context: {
        device_id: `DEV-RTO-${Date.now()}`,
        ip: "49.36.128.77",
        billing_shipping_mismatch: true,
        txn_count_1h: 2,
        txn_count_24h: 6,
        amount_sum_24h: 42000,
        distinct_devices_24h: 1,
        hour_of_day: 2,
      },
    },
  },
  {
    label: "Mule Ring (5 txns)",
    description: "Fires 5 sequential events to build a ring — expected HIGH",
    expected_band: "HIGH",
    payload: {
      event_id: `sandbox_ring_${Date.now()}`,
      amount: 45000.0,
      instrument: { method: "upi", vpa: "mule.sandbox@ybl" },
      customer: {
        id: "cust_mule", new_customer: true, account_age_days: 3,
        rto_rate_history: 0.0,
      },
      context: {
        device_id: "DEV-MULE-RING-01",
        ip: "203.0.113.7",
        email: "burner@tempmail.dev",
        txn_count_1h: 4,
        txn_count_24h: 10,
        amount_sum_24h: 180000,
        distinct_devices_24h: 1,
        hour_of_day: 3,
      },
    },
  },
  {
    label: "Synthetic Identity",
    description: "Brand-new account, disposable email — expected HIGH",
    expected_band: "HIGH",
    payload: {
      event_id: `sandbox_syn_${Date.now()}`,
      amount: 42000.0,
      instrument: { method: "card", card_fingerprint: "FP-SYN-TEST-1" },
      customer: {
        id: "cust_syn", new_customer: true, account_age_days: 1,
        rto_rate_history: 0.0,
      },
      context: {
        device_id: `DEV-SYN-${Date.now()}`,
        ip: "198.51.100.23",
        email: "synth.user@yopmail.com",
        billing_shipping_mismatch: true,
        txn_count_1h: 0,
        txn_count_24h: 1,
        amount_sum_24h: 42000,
        distinct_devices_24h: 1,
        hour_of_day: 4,
      },
    },
  },
];

function bandColor(band: string) {
  if (band === "LOW") return "text-risk-low";
  if (band === "MEDIUM") return "text-risk-medium";
  return "text-risk-high";
}

function bandBg(band: string) {
  if (band === "LOW") return "bg-risk-low/10 border-risk-low/30";
  if (band === "MEDIUM") return "bg-risk-medium/10 border-risk-medium/30";
  return "bg-risk-high/10 border-risk-high/30";
}

export default function SandboxPage() {
  const evaluate = useEvaluate();
  const qc = useQueryClient();
  const [result, setResult] = useState<RiskEvaluation | null>(null);
  const [history, setHistory] = useState<{ ts: number; r: RiskEvaluation }[]>([]);
  const [ringBuilding, setRingBuilding] = useState(false);
  const [ringProgress, setRingProgress] = useState(0);
  const [burstBuilding, setBurstBuilding] = useState(false);
  const [burstProgress, setBurstProgress] = useState(0);
  const [burstTotal, setBurstTotal] = useState(0);
  const [burstStats, setBurstStats] = useState<{ high: number; medium: number; low: number } | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const burstRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const [typedLines, setTypedLines] = useState<string[]>([]);

  useEffect(() => {
    return () => {
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
      burstRef.current.cancelled = true;
    };
  }, []);

  // Typewriter effect for agent terminal
  useEffect(() => {
    if (!result) return;
    const lines: string[] = [
      `[EDGE] Event ${result.event_id} received`,
      `[GRAPH] Component size: ${result.graph_evidence.component_size}, ring_detected: ${result.graph_evidence.ring_detected}`,
      `[MODEL] risk_score=${result.risk_score}  band=${result.risk_band}`,
      `[AGENT] Decision: ${result.decision.replace(/_/g, " ")}`,
      `[LEDGER] Audit ref: ${result.audit_ref}`,
    ];
    if (result.dispute_dossier) {
      lines.push(`[DOSSIER] ${result.dispute_dossier.title} (${result.dispute_dossier.generated_by})`);
    }
    setTypedLines([]);
    let i = 0;
    const id = setInterval(() => {
      if (i >= lines.length) { clearInterval(id); return; }
      setTypedLines((prev) => [...prev, lines[i]]);
      i++;
    }, 180);
    return () => clearInterval(id);
  }, [result]);

  const fire = useCallback((preset: Preset) => {
    const payload: Record<string, unknown> & { context?: Record<string, unknown> } = { ...preset.payload as Record<string, unknown>, event_id: `sandbox_${preset.label.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}` };
    // Ensure session isolation for per-session graph
    const ctx = (payload.context as Record<string, unknown>) || {};
    if (!ctx.session_id) ctx.session_id = `sess_${Date.now()}`;
    payload.context = ctx;
    evaluate.mutate(payload, {
      onSuccess: (data) => {
        setResult(data.data);
        setHistory((prev) => [{ ts: Date.now(), r: data.data }, ...prev].slice(0, 20));
        if (jsonError) setJsonError(null);
      },
    });
  }, [evaluate, jsonError]);

  const fireRing = useCallback(() => {
    if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
    setRingBuilding(true);
    setRingProgress(0);
    setResult(null);
    const base = Date.now();
    let i = 0;
    const interval = setInterval(() => {
      if (i >= 5) { clearInterval(interval); ringIntervalRef.current = null; setRingBuilding(false); return; }
      const payload = {
        event_id: `sandbox_ringseq_${base}_${i}`,
        amount: 45000.0,
        instrument: { method: "upi", vpa: `ring.sandbox.vpa${i + 1}@ybl` },
        customer: { id: `cust_ring_${i}`, new_customer: true, account_age_days: 3, rto_rate_history: 0.0 },
        context: {
          device_id: "DEV-MULE-RING-01",
          ip: "203.0.113.7",
          email: `ring${i + 1}@tempmail.dev`,
          txn_count_1h: i + 2,
          txn_count_24h: i + 5,
          amount_sum_24h: 45000 * (i + 1),
          distinct_devices_24h: 1,
          hour_of_day: 3,
          session_id: `ringseq_${base}`,
        },
      };
      evaluate.mutate(payload, {
        onSuccess: (data) => {
          setResult(data.data);
          setRingProgress((p) => p + 1);
          setHistory((prev) => [{ ts: Date.now(), r: data.data }, ...prev].slice(0, 20));
        },
      });
      i++;
    }, 300);
    ringIntervalRef.current = interval;
  }, [evaluate]);

  const fireRandomBurst = useCallback(async () => {
    const total = 200 + Math.floor(Math.random() * 201); // 200-400 randomized
    setBurstTotal(total);
    setBurstProgress(0);
    setBurstStats(null);
    setBurstBuilding(true);
    burstRef.current.cancelled = false;
    let high = 0, medium = 0, low = 0;
    const burstId = Date.now();
    // Pre-generate a pool of mule devices to create fan-out rings within the burst
    const muleDevices = Array.from({ length: 6 }, (_, k) => `DEV-MULE-BURST-${burstId}-${k}`);
    const muleAmounts: Record<string, number> = {};
    muleDevices.forEach((d) => { muleAmounts[d] = 25 + Math.floor(Math.random() * 4976); }); // fixed 25-5000 per mule device for same-amount repeat pattern
    const BATCH = 6; // parallel batch for 18-22 rps, completes 400 in ~20s, fully synced via invalidation+polling
    for (let batchStart = 0; batchStart < total; batchStart += BATCH) {
      if (burstRef.current.cancelled) break;
      const batchEnd = Math.min(batchStart + BATCH, total);
      const batchPromises: Promise<void>[] = [];
      for (let i = batchStart; i < batchEnd; i++) {
        const isMuleRing = Math.random() < 0.12;
        let payload: Record<string, unknown>;
        if (isMuleRing) {
          const dev = muleDevices[Math.floor(Math.random() * muleDevices.length)];
          const amt = muleAmounts[dev] + (Math.random() < 0.7 ? 0 : (Math.random() < 0.5 ? -3 : 3)); // same amount ±3 for range test
          payload = {
            event_id: `burst_${burstId}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            amount: Math.max(25, Math.round(amt)),
            instrument: { method: "upi", vpa: `mule.burst${Math.floor(Math.random() * 40)}@ybl`, card_fingerprint: `FP-BURST-${Math.floor(Math.random() * 12)}` },
            customer: { id: `cust_burst_${dev}_${i}`, new_customer: true, account_age_days: 1 + Math.floor(Math.random() * 5), rto_rate_history: Math.random() * 0.1 },
            context: {
              device_id: dev,
              ip: `203.0.113.${1 + Math.floor(Math.random() * 254)}`,
              email: `burst${i}@tempmail.dev`,
              txn_count_1h: 3 + Math.floor(Math.random() * 8),
              txn_count_24h: 8 + Math.floor(Math.random() * 20),
              amount_sum_24h: 5000 + Math.floor(Math.random() * 80000),
              distinct_devices_24h: 1 + Math.floor(Math.random() * 3),
              hour_of_day: Math.floor(Math.random() * 24),
              session_id: String(burstId),
            },
          };
        } else {
          const amount = 25 + Math.floor(Math.random() * 4976);
          payload = {
            event_id: `burst_${burstId}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            amount,
            instrument: Math.random() < 0.6
              ? { method: "upi", vpa: `user${Math.floor(Math.random() * 10000)}@ok${["hdfc","icici","ybl","upi"][Math.floor(Math.random()*4)]}bank` }
              : Math.random() < 0.5
                ? { method: "card", card_fingerprint: `FP-${Math.random().toString(36).slice(2, 8).toUpperCase()}` }
                : { method: "cod", is_cod: true },
          customer: {
            id: `cust_burst_${burstId}_${i}`,
            new_customer: Math.random() < 0.18,
            account_age_days: 120 + Math.floor(Math.random() * 1100),
            rto_rate_history: Math.random() < 0.06 ? 0.4 + Math.random() * 0.5 : Math.random() * 0.08,
          },
          context: {
            device_id: `DEV-BURST-${burstId}-${i}`,
            ip: `10.${burstId % 255}.${Math.floor(i / 255)}.${i % 255}`,
            email: Math.random() < 0.08 ? `user${i}@tempmail.dev` : `user${i}@gmail.com`,
            billing_shipping_mismatch: Math.random() < 0.04,
            txn_count_1h: Math.floor(Math.random() * 2),
            txn_count_24h: Math.floor(Math.random() * 4),
            amount_sum_24h: Math.floor(Math.random() * 18000),
            distinct_devices_24h: 1,
            hour_of_day: 10 + Math.floor(Math.random() * 8),
            session_id: String(burstId),
          },
          };
        }
        batchPromises.push(
          (async () => {
            try {
              const { data } = await evaluateRisk(payload as object);
              const band = data.risk_band;
              if (band === "HIGH") high += 1; else if (band === "MEDIUM") medium += 1; else low += 1;
              setResult(data);
              setHistory((prev) => [{ ts: Date.now(), r: data }, ...prev].slice(0, 30));
            } catch {
              // ignore single failure, still count progress
            } finally {
              setBurstProgress((p) => p + 1);
            }
          })()
        );
      }
      await Promise.all(batchPromises);
      // Sync Overview/Ledger/Graph live every batch
      qc.invalidateQueries({ queryKey: queryKeys.ledgerStats });
      qc.invalidateQueries({ queryKey: queryKeys.ledger() });
      qc.invalidateQueries({ queryKey: queryKeys.topology() });
      if (burstRef.current.cancelled) break;
      await new Promise((r) => setTimeout(r, 12)); // tiny yield, keeps 5000/min safe (~18 rps effective)
    }
    setBurstStats({ high, medium, low });
    setBurstBuilding(false);
    // Persist session for per-session graph
    try {
      const sessions = JSON.parse(localStorage.getItem("tracer.burstSessions") || "[]");
      sessions.unshift({ id: String(burstId), ts: Date.now(), total, high, medium, low, muleDevices });
      localStorage.setItem("tracer.burstSessions", JSON.stringify(sessions.slice(0, 12)));
    } catch {}
    // Final sync system-wide
    qc.invalidateQueries({ queryKey: queryKeys.ledgerStats });
    qc.invalidateQueries({ queryKey: queryKeys.ledger() });
    qc.invalidateQueries({ queryKey: queryKeys.topology() });
  }, [qc]);

  const fireCustom = useCallback(() => {
    try {
      const payload = JSON.parse(jsonInput);
      setJsonError(null);
      evaluate.mutate(payload, {
        onSuccess: (data) => {
          setResult(data.data);
          setHistory((prev) => [{ ts: Date.now(), r: data.data }, ...prev].slice(0, 20));
        },
        onError: (err) => setJsonError(String(err)),
      });
    } catch {
      setJsonError("Invalid JSON — check payload syntax");
    }
  }, [jsonInput, evaluate]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <TextReveal as="h1" text="Sandbox" by="char" className="text-3xl font-bold text-text-primary" />
        <p className="mt-1 text-sm text-text-secondary">
          Fire real payloads at the live backend. Every number on this page comes from the API response.
        </p>
      </div>

      {/* Preset Buttons */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Presets</h2>
        <div className="flex flex-wrap gap-3">
          {BUILTIN_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => fire(p)}
              disabled={evaluate.isPending || ringBuilding || burstBuilding}
              className="flex flex-col rounded-md border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent disabled:opacity-50"
            >
              <span className="text-sm font-semibold text-text-primary">{p.label}</span>
              <span className="mt-0.5 text-xs text-text-secondary">{p.description}</span>
              <span className={cn("mt-1 text-[10px] font-mono", bandColor(p.expected_band))}>
                Expected: {p.expected_band}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Ring Building Section */}
      <section className="rounded-md border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Build a Ring Live</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Fires 5 sequential events to the same device. Watch <code>ring_detected</code> flip to true.
        </p>
        <div className="mt-3 flex items-center gap-4">
          <Button onClick={fireRing} disabled={evaluate.isPending || ringBuilding || burstBuilding} variant="secondary">
            {ringBuilding ? `Firing... (${ringProgress}/5)` : "Fire 5-Ring Sequence"}
          </Button>
          {ringProgress >= 5 && !ringBuilding && (
            <span className="text-sm font-semibold text-risk-high">Ring complete — check graph evidence above</span>
          )}
        </div>
      </section>

      {/* Randomized High-Throughput Burst — 200-400 fully random, synced everywhere */}
      <section className="rounded-md border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Randomized Burst (200-400 txns)</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Fires 200-400 fully randomized payloads (amounts, devices, VPAs, IPs, risk signals). ~15% contain mule fan-out rings. Overview, Ledger, and Graph all sync live via polling + invalidation.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Button onClick={fireRandomBurst} disabled={burstBuilding || ringBuilding} variant="secondary">
            {burstBuilding ? `Bursting... ${burstProgress}/${burstTotal}` : "Fire Randomized Burst (200-400)"}
          </Button>
          {burstBuilding && (
            <div className="flex flex-1 items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-tertiary">
                <div className="h-full bg-accent transition-all duration-150" style={{ width: `${burstTotal ? (burstProgress / burstTotal) * 100 : 0}%` }} />
              </div>
              <span className="font-mono text-xs text-text-muted">{burstProgress}/{burstTotal}</span>
            </div>
          )}
          {!burstBuilding && burstStats && (
            <span className="font-mono text-xs text-text-secondary">
              Done — <span className="text-risk-high">HIGH {burstStats.high}</span> · <span className="text-gold-500">MED {burstStats.medium}</span> · <span className="text-risk-low">LOW {burstStats.low}</span> · total {burstTotal}
            </span>
          )}
          {burstBuilding && (
            <Button onClick={() => { burstRef.current.cancelled = true; }} variant="ghost">Cancel</Button>
          )}
        </div>
        <p className="mt-2 font-mono text-[10px] text-text-muted">Rate limit raised to 5000/min for burst; ~28ms jitter per txn keeps UI responsive.</p>
      </section>

      {/* Custom JSON Input */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Custom Payload</h2>
        <textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          placeholder='{"event_id": "custom_1", "amount": 5000, "instrument": {"method": "upi", "vpa": "test@upi"}, "context": {"device_id": "DEV-01"}}'
          className="min-h-[140px] rounded-md border border-border bg-bg-tertiary/60 p-3 font-mono text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
        />
        {jsonError && <p className="text-xs text-risk-high">{jsonError}</p>}
        <Button onClick={fireCustom} disabled={evaluate.isPending || !jsonInput.trim()} variant="secondary">
          Submit Custom Payload
        </Button>
      </section>

      {evaluate.isError && (
        <ErrorState
          title="Couldn't score payload"
          message={String((evaluate.error as Error)?.message || "Risk engine unreachable — check API connectivity")}
          onRetry={() => evaluate.reset()}
        />
      )}

      {evaluate.isPending && !result && (
        <div className="relative h-32"><Loader center label="scoring…" /></div>
      )}

      {/* Risk Gauge — live result */}
      {result && (
        <section className="rounded-md border border-border bg-surface p-6">
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-text-muted">Risk Score</span>
              <span className={cn("text-5xl font-bold", bandColor(result.risk_band))}>
                {result.risk_score}
              </span>
              <span className={cn("rounded-full border px-3 py-0.5 text-xs font-semibold", bandBg(result.risk_band), bandColor(result.risk_band))}>
                {result.risk_band}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-text-muted">Decision</span>
              <span className="text-sm font-semibold text-text-primary">
                {result.decision.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-text-muted">Latency: {result.latency_ms}ms</span>
              <span className="text-xs text-text-muted">Model: {result.model_version}</span>
              <span className="text-xs text-text-muted">Audit: {result.audit_ref}</span>
              {result.graph_evidence.ring_detected && (
                <span className="mt-1 rounded bg-risk-high/10 px-2 py-0.5 text-xs font-semibold text-risk-high">
                  Ring Detected — component size {result.graph_evidence.component_size}
                </span>
              )}
            </div>
            {result.top_factors.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-muted">Top SHAP factors</span>
                {result.top_factors.slice(0, 5).map((f) => (
                  <span key={f.feature} className="text-xs text-text-secondary">
                    <span className={f.direction === "RISK_UP" ? "text-risk-high" : "text-risk-low"}>
                      {f.direction === "RISK_UP" ? "▲" : "▼"}
                    </span>{" "}
                    {f.label}: {f.contribution.toFixed(1)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Agent Terminal */}
      {typedLines.length > 0 && (
        <section className="rounded-md border border-border bg-bg-primary p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Agent Trace</h2>
          <div ref={termRef} className="font-mono text-xs leading-relaxed text-text-secondary">
            {typedLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </section>
      )}

      {/* Event History */}
      {history.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">Event History (this session)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Event ID</th>
                  <th className="py-2 pr-4">Score</th>
                  <th className="py-2 pr-4">Band</th>
                  <th className="py-2">Ring</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.r.event_id} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-text-muted">{new Date(h.ts).toLocaleTimeString()}</td>
                    <td className="py-2 pr-4 font-mono text-text-secondary">{h.r.event_id}</td>
                    <td className={cn("py-2 pr-4 font-semibold", bandColor(h.r.risk_band))}>{h.r.risk_score}</td>
                    <td className={cn("py-2 pr-4", bandColor(h.r.risk_band))}>{h.r.risk_band}</td>
                    <td className="py-2">{h.r.graph_evidence.ring_detected ? "🔴" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
