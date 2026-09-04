"use client";

import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect } from "react";
import { useLedger, useLedgerStats, useModelReport } from "@/hooks/useApi";
import { useLiveFeed } from "@/hooks/useLiveFeed";
import ErrorState from "@/components/ui/ErrorState";
import Loader from "@/components/ui/Loader";
import StreamingText from "@/components/ui/StreamingText";
import LogPanel from "@/components/ui/LogPanel";
import { cn } from "@/lib/utils";

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="glass p-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
      <p className={cn("mt-1 font-sans text-2xl font-bold", tone ?? "text-text-primary")}>{value}</p>
    </div>
  );
}

const PIE_COLORS: Record<string, string> = {
  HIGH: "var(--color-danger)",
  MEDIUM: "var(--color-gold-500)",
  LOW: "var(--color-risk-low)",
};

export default function DashboardOverview() {
  const { data: model, isLoading: mLoading, isError: mError, error: mErr, refetch: refetchModel } = useModelReport();
  const { data: ledger, isLoading: lLoading, isError: lError, error: lErr, refetch: refetchLedger } = useLedgerStats();
  const { data: recentLedger, refetch: refetchRecent } = useLedger(100);
  const { alerts, connected } = useLiveFeed();
  const latest = alerts[0];

  // Fully sync charts to live feed: refetch ledger/model when a new alert arrives
  useEffect(() => {
    if (alerts.length > 0) {
      refetchLedger();
      refetchRecent();
      refetchModel();
    }
  }, [alerts.length, refetchLedger, refetchRecent, refetchModel]);

  const auprc = model?.auprc ?? model?.auc_roc ?? 0;
  const ceiling = model?.bayes_ceiling_auprc ?? 0;
  const eff = model?.efficiency_vs_ceiling ?? 0;
  const prev = model?.prevalence ?? 0;

  const modelMetrics = [
    { name: "AUPRC", v: auprc },
    { name: "Bayes Ceil", v: ceiling },
    { name: "Efficiency", v: eff },
    { name: "Prevalence", v: prev },
  ];

  const totalEntries = ledger?.entries ?? ledger?.total_entries ?? 0;
  const chainVerified = ledger?.chain_verified ?? ledger?.integrity_ok ?? true;

  // Live Ledger Flow derived from recent 100 ledger entries' risk bands — updates with every transaction
  const bandCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>;
  (recentLedger ?? []).forEach((e: { band?: string }) => {
    const b = (e.band ?? "LOW").toUpperCase();
    if (b in bandCounts) bandCounts[b] += 1;
  });
  const hasLiveBands = (recentLedger?.length ?? 0) > 0;
  const pieData = hasLiveBands
    ? [
        { name: "HIGH", value: bandCounts.HIGH || 0 },
        { name: "MEDIUM", value: bandCounts.MEDIUM || 0 },
        { name: "LOW", value: bandCounts.LOW || 0 },
      ].filter((d) => d.value > 0)
    : [
        { name: "Credited", value: 1 },
        { name: "Debited", value: 1 },
      ];
  const pieColors = hasLiveBands ? pieData.map((d) => PIE_COLORS[d.name] ?? "var(--color-text-muted)") : ["var(--color-risk-low)", "var(--color-entity-vpa)"];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-sans text-3xl font-bold text-text-primary">Overview</h1>
          <p className="text-sm text-text-secondary">Live risk-engine telemetry & ledger integrity.</p>
        </div>
        <span className="chip">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-risk-low animate-glow-breathe" : "bg-text-muted"}`} />
          <span className="text-text-secondary">LIVE FEED {connected ? "CONNECTED" : "POLLING"}</span>
        </span>
      </div>

      {(mError || lError) ? (
        <ErrorState
          title="Couldn't load overview"
          message={String((mErr as Error)?.message || (lErr as Error)?.message || "Risk engine unreachable — check API connectivity")}
          onRetry={() => { refetchModel(); refetchLedger(); refetchRecent(); }}
        />
      ) : mLoading || lLoading ? (
        <div className="relative h-64"><Loader center /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label="Model AUPRC" value={model ? auprc.toFixed(3) : "—"} tone="text-risk-low" />
            <Kpi label="Ledger Entries" value={ledger ? String(totalEntries) : "—"} />
            <Kpi label="Chain Head" value={ledger?.chain_head ? `${ledger.chain_head.slice(0, 10)}…` : "—"} tone="text-accent" />
            <Kpi label="Integrity" value={chainVerified ? "OK (VERIFIED)" : "CHECK"} tone={chainVerified ? "text-risk-low" : "text-warn"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="glass p-5">
              <h2 className="mb-3 font-sans text-sm font-semibold tracking-widest text-text-muted">MODEL QUALITY (HOLD-OUT)</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={modelMetrics} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} />
                  <YAxis domain={[0, 1]} stroke="var(--color-text-muted)" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-bg-secondary)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: "var(--color-text-primary)",
                    }}
                    labelStyle={{ color: "var(--color-text-primary)" }}
                    itemStyle={{ color: "var(--color-text-primary)" }}
                  />
                  <Bar dataKey="v" radius={[6, 6, 0, 0]}>
                    {modelMetrics.map((_, i) => (
                      <Cell key={i} fill={i % 2 === 0 ? "var(--color-accent)" : "var(--color-entity-vpa)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-sans text-sm font-semibold tracking-widest text-text-muted">LEDGER FLOW</h2>
                <span className="font-mono text-[10px] text-text-muted">{hasLiveBands ? "LIVE risk bands (last 100)" : "LIVE"}</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={pieColors[i] ?? "var(--color-text-muted)"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-bg-secondary)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: "var(--color-text-primary)",
                    }}
                    labelStyle={{ color: "var(--color-text-primary)" }}
                    itemStyle={{ color: "var(--color-text-primary)" }}
                    formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              {hasLiveBands && (
                <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] text-text-secondary">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS.HIGH }} />HIGH {bandCounts.HIGH}</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS.MEDIUM }} />MED {bandCounts.MEDIUM}</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS.LOW }} />LOW {bandCounts.LOW}</span>
                </div>
              )}
            </div>
          </div>
          <div className="rounded-md border border-risk-high/30 bg-risk-high/10 p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
            <span className="font-bold text-risk-high">GBDT disclosure:</span> At any calibrated confidence threshold (p≥0.50 / 0.70 / 0.90) this model&apos;s standalone recall is 0% on our synthetic benchmark (P=0.000 R=0.000) — it is used only for SHAP explanation surfacing and policy-floor inputs, not as a standalone detector. Ring detection on graph topology is the headline claim.
          </div>
        </>
      )}

      <LogPanel title="live_alert_stream.log" lineCount={7}>
        {latest ? (
          <StreamingText
            key={latest.id}
            text={`[${new Date(latest.ts).toLocaleTimeString()}] ${latest.title} — ${latest.detail}`}
            speed={10}
            ariaLabel={latest.title}
          />
        ) : (
          <p className="font-mono text-xs text-text-muted">awaiting alerts…</p>
        )}

        <ul className="mt-4 space-y-1.5">
          {alerts.slice(0, 6).map((a) => (
            <motion.li
              key={a.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 rounded-md border border-border bg-bg-tertiary/40 px-3 py-2 font-mono text-[11px] text-text-secondary"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  background:
                    a.level === "alert" ? "var(--color-danger)" :
                    a.level === "warn" ? "var(--color-gold-500)" :
                    a.level === "success" ? "var(--color-neon-green)" : "var(--color-text-muted)",
                }}
              />
              <span className="truncate">{a.title}</span>
            </motion.li>
          ))}
        </ul>
      </LogPanel>
    </div>
  );
}
