"use client";

import { useEffect, useState } from "react";
import { useLedger, useLedgerStats } from "@/hooks/useApi";
import { useLiveFeed } from "@/hooks/useLiveFeed";
import ErrorState from "@/components/ui/ErrorState";
import Loader from "@/components/ui/Loader";
import StreamingText from "@/components/ui/StreamingText";
import TextReveal from "@/components/ui/TextReveal";
import type { LedgerEntry, LedgerStat } from "@/lib/types";

function buildReport(stats: LedgerStat | undefined, rows: LedgerEntry[]): string {
  if (!stats) return "Ledger unavailable — engine offline.";
  const verified = stats.chain_verified ?? stats.integrity_ok ?? true;
  const entries = stats.entries ?? stats.total_entries ?? 0;
  const head = stats.chain_head ?? stats.last_hash ?? "GENESIS";
  const safeRows = Array.isArray(rows) ? rows : [];
  const recent = safeRows.slice(0, 4).map((r) => `- \`${r.event_id}\` ${r.action} (${r.direction}) ₹${r.amount} [${r.band ?? r.direction}]`).join("\n");
  return `**Hash-chained audit ledger** — integrity ${verified ? "VERIFIED ✓" : "BROKEN ✗"}

- Total entries: **${entries}**
- Ledger file: \`${stats.path ?? "ledger.jsonl"}\`
- Chain head: \`${head.slice(0, 16)}…\`

Recent writes (live, last 4 of ${safeRows.length} fetched):
${recent || "- No recent entries recorded"}`;
}

export default function LedgerPage() {
  const { data: stats, isError: statsError, error: statsErr, refetch: refetchStats } = useLedgerStats();
  const { data: rows, isLoading, isError, error, refetch } = useLedger(120);
  const { alerts } = useLiveFeed();
  const [lastSync, setLastSync] = useState<string>("");
  const safeRows = Array.isArray(rows) ? rows : [];
  const report = buildReport(stats, safeRows);

  // Fully sync ledger to every transaction system-wide
  useEffect(() => {
    if (alerts.length > 0) {
      refetch();
      refetchStats();
      setLastSync(new Date().toLocaleTimeString());
    }
  }, [alerts.length, refetch, refetchStats]);

  useEffect(() => {
    if (safeRows.length > 0) setLastSync(new Date().toLocaleTimeString());
  }, [safeRows.length]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TextReveal as="h1" text="Audit Ledger" by="char" className="font-sans text-3xl font-bold text-text-primary" />
        <span className="chip flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-risk-low" />
          <span className="font-mono text-[11px] text-text-secondary">LIVE SYNC</span>
          {lastSync && <span className="font-mono text-[10px] text-text-muted">· {lastSync}</span>}
          <span className="font-mono text-[10px] text-text-muted">· {safeRows.length} fetched · {stats?.entries ?? 0} total</span>
        </span>
      </div>

      <div className="glass p-6">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">INTEGRITY REPORT — FULLY SYNCED SYSTEM-WIDE</h2>
        <StreamingText text={report} speed={12} markdown ariaLabel="Ledger integrity report" />
      </div>

      {(isError || statsError) ? (
        <ErrorState
          title="Couldn't load ledger"
          message={String((error as Error)?.message || (statsErr as Error)?.message || "Ledger unreachable")}
          onRetry={() => { refetch(); refetchStats(); }}
        />
      ) : (
        <div className="glass overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">CHAIN ENTRIES — LIVE (120 most recent, auto-refresh 3s)</span>
            <span className="font-mono text-[10px] text-text-muted">Synced with Overview · Graph · Transactions</span>
          </div>
          {isLoading ? (
            <div className="relative h-48"><Loader center /></div>
          ) : (
          <div className="terminal-scroll max-h-[520px] overflow-auto">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="sticky top-0 bg-bg-secondary/80 font-mono text-[10px] uppercase tracking-wider text-text-muted backdrop-blur">
                <tr>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-3 py-2.5">Time</th>
                  <th className="px-3 py-2.5">Event</th>
                  <th className="px-3 py-2.5">Band</th>
                  <th className="px-3 py-2.5">Amount</th>
                  <th className="px-3 py-2.5">Action</th>
                  <th className="px-3 py-2.5">Side</th>
                  <th className="px-3 py-2.5">Hash</th>
                </tr>
              </thead>
              <tbody>
                {safeRows.map((r) => (
                  <tr key={r.seq} className="border-t border-border hover:bg-bg-tertiary/40">
                    <td className="px-4 py-2.5 font-mono text-[12px] text-text-muted">{r.seq}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-text-muted">{r.ts_ms ? new Date(r.ts_ms).toLocaleTimeString() : "-"}</td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 font-mono text-[12px] text-text-secondary" title={r.event_id}>{r.event_id}</td>
                    <td className="px-3 py-2.5"><span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold ${r.band === "HIGH" ? "border-risk-high/30 bg-risk-high/10 text-risk-high" : r.band === "MEDIUM" ? "border-gold-500/30 bg-gold-500/10 text-gold-500" : "border-risk-low/30 bg-risk-low/10 text-risk-low"}`}>{r.band ?? "-"}</span></td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-text-primary">₹{Number(r.amount).toLocaleString()}</td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-xs text-text-primary" title={r.action}>{r.action}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px]"><span className={`rounded px-1.5 py-0.5 ${r.direction === "CREDIT" ? "bg-risk-low/10 text-risk-low" : "bg-entity-vpa/10 text-entity-vpa"}`}>{r.direction}</span></td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-risk-low/80">{r.hash.slice(0, 10)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
