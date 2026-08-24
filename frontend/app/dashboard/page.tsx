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
import GoldLoader from "@/components/ui/GoldLoader";
import StreamingText from "@/components/ui/StreamingText";
import { cn } from "@/lib/utils";

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="glass p-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
      <p className={cn("mt-1 font-grotesk text-2xl font-bold", tone ?? "text-text-primary")}>{value}</p>
    </div>
  );
}

const PIE_COLORS = ["var(--color-neon-green)", "var(--color-gold-500)", "var(--color-danger)", "var(--color-text-muted)"];

export default function DashboardOverview() {
  const { data: model, isLoading: mLoading } = useModelReport();
  const { data: ledger, isLoading: lLoading } = useLedgerStats();
  const { alerts, connected } = useLiveFeed();
  const latest = alerts[0];

  const modelMetrics = model
    ? [
        { name: "AUC", v: model.auc_roc },
        { name: "Precision", v: model.precision },
        { name: "Recall", v: model.recall },
        { name: "F1", v: model.f1 },
      ]
    : [];
  const pieData = ledger
    ? [
        { name: "Credited", value: ledger.credited },
        { name: "Debited", value: ledger.debited },
        { name: "Disputed", value: ledger.disputed },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-grotesk text-3xl font-bold text-text-primary">Overview</h1>
          <p className="text-sm text-text-secondary">Live risk-engine telemetry & ledger integrity.</p>
        </div>
        <span className="chip">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-neon-green animate-glow-breathe" : "bg-text-muted"}`} />
          <span className="text-text-secondary">LIVE FEED {connected ? "CONNECTED" : "POLLING"}</span>
        </span>
      </div>

      {mLoading || lLoading ? (
        <div className="relative h-64"><GoldLoader center /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label="Model AUC" value={model ? model.auc_roc.toFixed(3) : "—"} tone="text-neon-green" />
            <Kpi label="Ledger Entries" value={ledger ? String(ledger.total_entries) : "—"} />
            <Kpi label="Disputed" value={ledger ? String(ledger.disputed) : "—"} tone="text-danger" />
            <Kpi label="Integrity" value={ledger?.integrity_ok ? "OK" : "CHECK"} tone={ledger?.integrity_ok ? "text-neon-green" : "text-warn"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="glass p-5">
              <h2 className="mb-3 font-grotesk text-sm font-semibold tracking-widest text-text-muted">MODEL QUALITY</h2>
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
                  />
                  <Bar dataKey="v" radius={[6, 6, 0, 0]}>
                    {modelMetrics.map((_, i) => (
                      <Cell key={i} fill={i % 2 === 0 ? "var(--color-neon-green)" : "var(--color-gold-500)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass p-5">
              <h2 className="mb-3 font-grotesk text-sm font-semibold tracking-widest text-text-muted">LEDGER FLOW</h2>
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
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      <div className="glass p-5">
        <div className="mb-3 flex items-center gap-2 font-grotesk text-sm font-semibold tracking-widest text-text-muted">
          LIVE ALERT STREAM
        </div>
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
      </div>
    </div>
  );
}
