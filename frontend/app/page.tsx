"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useEvaluate } from "@/hooks/useApi";
import type { RiskEvaluation } from "@/lib/types";

// Real curl examples that actually work against the backend
const PRESETS = [
  {
    name: "Normal UPI",
    curl: `curl -X POST http://127.0.0.1:8000/api/v1/risk/evaluate \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_id": "curl_norm_123",
    "amount": 2500.0,
    "instrument": {"method": "upi", "vpa": "user.normal@upi"},
    "customer": {"id": "cust_norm", "new_customer": false, "account_age_days": 800, "rto_rate_history": 0.0},
    "context": {
      "device_id": "DEV-NORMAL-123",
      "ip": "103.25.45.12",
      "txn_count_1h": 1, "txn_count_24h": 3, "amount_sum_24h": 7500,
      "distinct_devices_24h": 1, "hour_of_day": 14
    }
  }'`,
    payload: {
      event_id: "curl_norm",
      amount: 2500.0,
      instrument: { method: "upi", vpa: "user.normal@upi" },
      customer: { id: "cust_norm", new_customer: false, account_age_days: 800, rto_rate_history: 0.0 },
      context: {
        device_id: "DEV-NORMAL-123", ip: "103.25.45.12",
        txn_count_1h: 1, txn_count_24h: 3, amount_sum_24h: 7500,
        distinct_devices_24h: 1, hour_of_day: 14
      },
    },
  },
  {
    name: "Mule Ring",
    curl: `curl -X POST http://127.0.0.1:8000/api/v1/risk/evaluate \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_id": "curl_ring_123",
    "amount": 45000.0,
    "instrument": {"method": "upi", "vpa": "mule.ring@ybl"},
    "customer": {"id": "cust_mule", "new_customer": true, "account_age_days": 3, "rto_rate_history": 0.0},
    "context": {
      "device_id": "DEV-MULE-RING-01",
      "ip": "203.0.113.7", "email": "burner@tempmail.dev",
      "txn_count_1h": 4, "txn_count_24h": 10, "amount_sum_24h": 180000,
      "distinct_devices_24h": 1, "hour_of_day": 3
    }
  }'`,
    payload: {
      event_id: "curl_ring",
      amount: 45000.0,
      instrument: { method: "upi", vpa: "mule.ring@ybl" },
      customer: { id: "cust_mule", new_customer: true, account_age_days: 3, rto_rate_history: 0.0 },
      context: {
        device_id: "DEV-MULE-RING-01", ip: "203.0.113.7", email: "burner@tempmail.dev",
        txn_count_1h: 4, txn_count_24h: 10, amount_sum_24h: 180000,
        distinct_devices_24h: 1, hour_of_day: 3
      },
    },
  },
];

// Feature descriptions with links to actual pages
const FEATURES = [
  {
    num: 1,
    title: "Ingest",
    desc: "Real-time webhook ingestion — every event logged to an append-only SQLite WAL stream before scoring.",
    link: "/dashboard/transactions",
    img: "transactions",
  },
  {
    num: 2,
    title: "Score",
    desc: "GBDT + graph-derived risk scoring — structural features, EWMA slope trajectory, PSI drift monitoring.",
    link: "/dashboard/sandbox",
    img: "sandbox",
  },
  {
    num: 3,
    title: "Graph",
    desc: "Live entity graph — devices, VPAs, cards, IPs linked incrementally; ring detection via structural classifier.",
    link: "/dashboard/graph",
    img: "graph",
  },
  {
    num: 4,
    title: "Agent",
    desc: "Bounded state-machine response — only AUTO_APPROVE, STEP_UP_AUTHENTICATION, or PAUSE_PAYOUT.",
    link: "/dashboard/sandbox",
    img: "sandbox",
  },
  {
    num: 5,
    title: "Audit",
    desc: "Hash-chained, queryable decision ledger — every score, band, and decision written with cryptographic refs.",
    link: "/dashboard/ledger",
    img: "ledger",
  },
  {
    num: 6,
    title: "Sandbox",
    desc: "Try it live — fire real payloads, watch ring detection flip in real time, copy working curl commands.",
    link: "/dashboard/sandbox",
    img: "sandbox",
  },
];

// Fetch model version for footer
function useVersion() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/v1/model/report")
      .then((r) => r.json())
      .then((d) => setVersion(d.model_version))
      .catch(() => null);
  }, []);
  return version ?? "v1.0";
}

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState("Normal UPI");
  const [result, setResult] = useState<RiskEvaluation | null>(null);
  const evaluate = useEvaluate();

  const runCurl = () => {
    const preset = PRESETS.find((p) => p.name === activeTab);
    if (!preset) return;
    setResult(null);
    evaluate.mutate(preset.payload, {
      onSuccess: (d) => setResult(d.data),
    });
  };

  const copyCurl = () => {
    const preset = PRESETS.find((p) => p.name === activeTab);
    if (!preset) return;
    navigator.clipboard.writeText(preset.curl);
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Slim top nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg-primary/70 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-6">
          <Link href="/" className="font-mono text-lg font-bold text-text-primary">
            TRACER
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="https://github.com/WHITEJACK5/RPTracer" target="_blank" rel="noreferrer" className="text-sm text-text-secondary hover:text-accent">
              GitHub
            </a>
            <a href="https://github.com/WHITEJACK5/RPTracer#readme" target="_blank" rel="noreferrer" className="text-sm text-text-secondary hover:text-accent">
              Docs
            </a>
          </nav>
          <Link
            href="/dashboard"
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            Open Dashboard
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-[1100px] px-6 pb-24 pt-16">
        <span className="mb-6 inline-block rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-accent">
          Defense-Only • Razorpay Buildathon 2026
        </span>

        <h1 className="font-mono text-3xl font-bold text-text-primary md:text-5xl">
          Mule rings don't hide from topology
          <br />
          <span className="font-bold text-accent">Real-time detection. Bounded response.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-text-secondary">
          High-frequency AI risk engine — GBDT scoring, structural graph classification,
          bounded autonomous agent decisions, and a hash-chained audit ledger.
        </p>

        <div className="mt-8 flex items-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-md bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            Open Dashboard
          </Link>
          <Link
            href="/dashboard/sandbox"
            className="rounded-md border border-accent/30 bg-transparent px-6 py-3 text-sm font-semibold text-accent hover:bg-accent/10"
          >
            Try the Sandbox
          </Link>
        </div>

        {/* Terminal block */}
        <section className="mt-12 rounded-md border border-border bg-bg-secondary p-1">
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
            <div className="flex gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setActiveTab(p.name)}
                  className={`rounded px-3 py-1 text-xs font-mono transition-colors ${
                    activeTab === p.name
                      ? "bg-accent/20 text-accent"
                      : "text-text-muted hover:bg-bg-tertiary"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyCurl}
                className="rounded px-3 py-1 text-xs font-mono text-text-secondary hover:bg-bg-tertiary"
              >
                Copy
              </button>
              <button
                onClick={runCurl}
                disabled={evaluate.isPending}
                className={`rounded px-3 py-1 text-xs font-mono transition-colors ${
                  evaluate.isPending
                    ? "opacity-50"
                    : "text-accent hover:bg-bg-tertiary"
                }`}
              >
                {evaluate.isPending ? "Running..." : "Run it"}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto p-4">
            <pre className="font-mono text-xs text-text-secondary">
              <code>{PRESETS.find((p) => p.name === activeTab)?.curl}</code>
            </pre>
          </div>
          {result && (
            <div className="border-t border-border/50 bg-bg-tertiary p-4">
              <div className="flex flex-wrap gap-4 font-mono text-xs">
                <span>
                  risk_score: <span className="font-bold text-text-primary">{result.risk_score}</span>
                </span>
                <span>
                  risk_band:{" "}
                  <span className={result.risk_band === "HIGH" ? "text-risk-high" : "text-accent"}>
                    {result.risk_band}
                  </span>
                </span>
                <span>
                  decision: <span className="text-text-primary">{result.decision}</span>
                </span>
                <span>
                  latency: {result.latency_ms}ms
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Numbered feature list */}
        <section className="mt-24">
          <div className="grid gap-16 md:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.num} className="flex gap-6">
                <div className="flex-shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-accent text-lg font-bold text-white">
                    #{f.num}
                  </div>
                </div>
                <div>
                  <h2 className="font-mono text-lg font-bold text-text-primary">{f.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{f.desc}</p>
                  <Link href={f.link} className="mt-4 inline-block text-sm text-accent hover:underline">
                    Try it live →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-bg-secondary">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-6">
          <div className="flex items-center gap-4">
            <span className="font-mono text-sm text-text-primary">
              TRACER {useVersion()}
            </span>
            <span className="text-text-muted">•</span>
            <span className="text-xs text-text-muted">MIT License</span>
          </div>
          <span className="font-mono text-sm text-text-secondary">Razorpay AI Buildathon 2026</span>
        </div>
      </footer>
    </div>
  );
}
