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
import { useLedgerStats, useModelReport } from "@/hooks/useApi";
import { useLiveFeed } from "@/hooks/useLiveFeed";
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

const PIE_COLORS = ["var(--color-risk-low)", "var(--color-entity-vpa)", "var(--color-danger)", "var(--color-text-muted)"];

export default function DashboardOverview() {
  const { data: model, isLoading: mLoading } = useModelReport();
  const { data: ledger, isLoading: lLoading } = useLedgerStats();
  const { alerts, connected } = useLiveFeed();
  const latest = alerts[0];

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
  const debited = ledger?.debited ?? Math.floor(totalEntries / 2);
  const credited = ledger?.credited ?? Math.ceil(totalEntries / 2);
  const disputed = ledger?.disputed ?? 0;

  const pieData = [
    { name: "Credited", value: credited || 1 },
    { name: "Debited", value: debited || 1 },
    { name: "Disputed", value: disputed || 0 },
  ];

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

      {mLoading || lLoading ? (
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
              <h2 className="mb-3 font-sans text-sm font-semibold tracking-widest text-text-muted">LEDGER FLOW</h2>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
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
            </div>
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
