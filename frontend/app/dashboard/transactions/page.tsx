"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLedger } from "@/hooks/useApi";
import { Input, FloatingInput } from "@/components/ui/Input";
import Loader from "@/components/ui/Loader";
import GlassForm from "@/components/ui/GlassForm";
import TextReveal from "@/components/ui/TextReveal";
import type { LedgerEntry } from "@/lib/types";

type Filters = { q: string; minAmount: string; direction: string };

export default function TransactionsPage() {
  const { data, isLoading } = useLedger(200);
  const [filters, setFilters] = useState<Filters>({ q: "", minAmount: "", direction: "ALL" });

  const rows: LedgerEntry[] = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const min = filters.minAmount ? Number(filters.minAmount) : 0;
    return data.filter((r) => {
      if (filters.q && !(`${r.event_id} ${r.action} ${r.actor}`.toLowerCase().includes(filters.q.toLowerCase()))) return false;
      if (min && r.amount < min) return false;
      if (filters.direction !== "ALL" && r.direction !== filters.direction) return false;
      return true;
    });
  }, [data, filters]);

  function onFilter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setFilters({
      q: String(fd.get("q") ?? ""),
      minAmount: String(fd.get("minAmount") ?? ""),
      direction: String(fd.get("direction") ?? "ALL"),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <TextReveal as="h1" text="Transactions" by="char" className="font-sans text-3xl font-bold text-text-primary" />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <FloatingInput
            label="Search"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
          <GlassForm title="Advanced filters" onSubmit={onFilter} submitLabel="Apply">
            <Input label="Min amount" name="minAmount" type="number" placeholder="0" defaultValue={filters.minAmount} />
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-muted">Direction</span>
              <select
                name="direction"
                defaultValue={filters.direction}
                className="w-full rounded-md border border-border bg-bg-tertiary/60 px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-accent"
              >
                <option value="ALL">All</option>
                <option value="CREDIT">Credit</option>
                <option value="DEBIT">Debit</option>
              </select>
            </label>
          </GlassForm>
        </div>

        <div className="glass overflow-hidden p-0">
          <div className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {rows.length} ENTRIES
          </div>
          {isLoading ? (
            <div className="relative h-64"><Loader center /></div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center font-mono text-xs text-text-muted">No transactions match your filters.</p>
          ) : (
            <div className="terminal-scroll max-h-[560px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-bg-secondary/80 font-mono text-[10px] uppercase tracking-wider text-text-muted backdrop-blur">
                  <tr>
                    <th className="px-5 py-2.5">Event</th>
                    <th className="px-3 py-2.5">Action</th>
                    <th className="px-3 py-2.5">Dir</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.seq} className="border-t border-border hover:bg-bg-tertiary/40">
                      <td className="px-5 py-2.5 font-mono text-[12px] text-text-secondary">{r.event_id}</td>
                      <td className="px-3 py-2.5 text-text-primary">{r.action}</td>
                      <td className="px-3 py-2.5">
                        <span className={r.direction === "CREDIT" ? "text-risk-low" : "text-accent"}>{r.direction}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[12px] text-text-primary">₹{r.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
