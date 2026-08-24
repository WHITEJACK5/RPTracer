"use client";

import { useLedger, useLedgerStats } from "@/hooks/useApi";
import GoldLoader from "@/components/ui/GoldLoader";
import StreamingText from "@/components/ui/StreamingText";
import TextReveal from "@/components/ui/TextReveal";
import type { LedgerEntry, LedgerStat } from "@/lib/types";

function buildReport(stats: LedgerStat | undefined, rows: LedgerEntry[]): string {
  if (!stats) return "Ledger unavailable — engine offline.";
  const recent = rows.slice(0, 4).map((r) => `- \`${r.event_id}\` ${r.action} (${r.direction}) ₹${r.amount}`).join("\n");
  return `**Hash-chained audit ledger** — integrity ${stats.integrity_ok ? "VERIFIED ✓" : "BROKEN ✗"}

- Total entries: **${stats.total_entries}**
- Credited: ${stats.credited} · Debited: ${stats.debited} · Disputed: ${stats.disputed}
- Chain head: \`${stats.last_hash.slice(0, 16)}…\`

Recent writes:
${recent}`;
}

export default function LedgerPage() {
  const { data: stats } = useLedgerStats();
  const { data: rows, isLoading } = useLedger(50);
  const report = buildReport(stats, rows ?? []);

  return (
    <div className="flex flex-col gap-6">
      <TextReveal as="h1" text="Audit Ledger" by="char" className="font-grotesk text-3xl font-bold text-text-primary" />

      <div className="glass p-6">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">INTEGRITY REPORT</h2>
        <StreamingText text={report} speed={12} markdown ariaLabel="Ledger integrity report" />
      </div>

      <div className="glass overflow-hidden p-0">
        <div className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
          CHAIN ENTRIES
        </div>
        {isLoading ? (
          <div className="relative h-48"><GoldLoader center /></div>
        ) : (
          <div className="terminal-scroll max-h-[420px] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-bg-secondary/80 font-mono text-[10px] uppercase tracking-wider text-text-muted backdrop-blur">
                <tr>
                  <th className="px-5 py-2.5">#</th>
                  <th className="px-3 py-2.5">Event</th>
                  <th className="px-3 py-2.5">Action</th>
                  <th className="px-3 py-2.5">Actor</th>
                  <th className="px-3 py-2.5">Hash</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r) => (
                  <tr key={r.seq} className="border-t border-border hover:bg-bg-tertiary/40">
                    <td className="px-5 py-2.5 font-mono text-[12px] text-text-muted">{r.seq}</td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-text-secondary">{r.event_id}</td>
                    <td className="px-3 py-2.5 text-text-primary">{r.action}</td>
                    <td className="px-3 py-2.5 text-text-secondary">{r.actor}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-neon-green/80">{r.hash.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
