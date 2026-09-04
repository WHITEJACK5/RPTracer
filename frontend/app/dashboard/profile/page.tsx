"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLedgerStats } from "@/hooks/useApi";
import TextReveal from "@/components/ui/TextReveal";

export default function ProfilePage() {
  const [email, setEmail] = useState("analyst@razorpay.com");
  const { data: stats } = useLedgerStats();

  useEffect(() => {
    try { setEmail(localStorage.getItem("tracer.session.email") || "analyst@razorpay.com"); } catch {}
  }, []);

  const name = email.split("@")[0].split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") || "Analyst";
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "AR";

  return (
    <div className="flex flex-col gap-6">
      <TextReveal as="h1" text="Public Profile" by="char" className="font-sans text-3xl font-bold text-text-primary" />
      <p className="text-sm text-text-secondary">Your TRACER analyst identity — synced from login session.</p>

      <div className="glass overflow-hidden p-0">
        <div className="relative h-28 bg-gradient-to-r from-accent/20 via-accent/10 to-transparent">
          <div className="absolute -bottom-10 left-6 flex items-end gap-4">
            <div className="grid h-20 w-20 place-items-center rounded-full border-4 border-bg-secondary bg-accent text-xl font-bold text-white shadow-lg">{initials}</div>
            <div className="pb-2">
              <h2 className="font-sans text-xl font-bold text-text-primary">{name}</h2>
              <p className="font-mono text-sm text-text-muted">{email}</p>
            </div>
          </div>
          <span className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-risk-low/15 px-3 py-1.5 font-mono text-xs font-semibold text-risk-low"><span className="h-2 w-2 animate-pulse rounded-full bg-risk-low" /> ONLINE · TRACER Watch</span>
        </div>
        <div className="px-6 pb-6 pt-12">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-bg-tertiary px-3 py-1.5 font-mono text-xs text-text-secondary">Risk Analyst</span>
            <span className="rounded-full border border-border bg-bg-tertiary px-3 py-1.5 font-mono text-xs text-text-secondary">Razorpay · Buildathon 2026</span>
            <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 font-mono text-xs font-medium text-accent">Track 2 · Mule-Ring Defense</span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-[var(--radius-md)] border border-border bg-bg-primary/60 p-4 text-center">
              <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Role</p>
              <p className="mt-2 font-sans text-base font-bold text-text-primary">Lead Analyst</p>
              <p className="font-mono text-xs text-text-muted">Full access · Ops</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-border bg-bg-primary/60 p-4 text-center">
              <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Ledger Impact</p>
              <p className="mt-2 font-mono text-xl font-bold text-accent">{stats?.entries?.toLocaleString() ?? "—"}</p>
              <p className="font-mono text-xs text-text-muted">entries audited</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-border bg-bg-primary/60 p-4 text-center">
              <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Auth</p>
              <p className="mt-2 font-mono text-sm font-bold text-risk-low">Verified ✓</p>
              <p className="font-mono text-xs text-text-muted">localStorage · tracer.session</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[var(--radius-md)] border border-border bg-bg-primary/40 p-4">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">Work Details</h3>
              <div className="mt-3 space-y-2.5 font-mono text-sm">
                <div className="flex justify-between"><span className="text-text-muted">Work email</span><span className="font-medium text-text-primary">{email}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Team</span><span className="text-text-primary">TRACER Watch · Ops</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Member since</span><span className="text-text-primary">2026-09-04 · Buildathon</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Region</span><span className="text-text-primary">India · UPI Rail</span></div>
              </div>
            </div>
            <div className="rounded-[var(--radius-md)] border border-border bg-bg-primary/40 p-4">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">Activity</h3>
              <div className="mt-3 space-y-2 font-mono text-sm">
                <div className="flex justify-between"><span className="text-text-muted">Last login</span><span className="text-text-primary">{new Date().toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Session</span><span className="text-accent">Active · {typeof window !== "undefined" && localStorage.getItem("tracer.session") ? "Valid" : "Demo"}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Graph</span><span className="text-text-primary">Mule-ring topology · live</span></div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard/settings" className="rounded-md border border-border bg-bg-tertiary px-4 py-2 font-mono text-sm font-medium text-text-secondary hover:bg-bg-tertiary/80">Manage account</Link>
            <Link href="/dashboard" className="rounded-md bg-accent px-4 py-2 font-mono text-sm font-semibold text-white hover:bg-accent/90">Back to Overview</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
