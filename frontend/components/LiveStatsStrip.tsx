"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

type HealthData = {
  status: string;
  uptime_s: number;
  degraded?: boolean;
};

type ModelReport = {
  model_version: string;
  accuracy?: number;
  is_degraded?: boolean;
};

function formatUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function Skeleton({ width }: { width: string }) {
  return <span className={`inline-block animate-pulse rounded bg-bg-tertiary ${width} h-3`} />;
}

export default function LiveStatsStrip() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [model, setModel] = useState<ModelReport | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/healthz`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ status: "offline", uptime_s: 0 }));

    fetch(`${API_BASE}/api/v1/model/report`)
      .then((r) => r.json())
      .then(setModel)
      .catch(() => null);
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[10px] tracking-wide text-text-muted">
      {model ? (
        <span className="font-sans font-bold text-text-secondary">
          {model.model_version}
          {model.is_degraded ? " (degraded)" : ""}
        </span>
      ) : (
        <Skeleton width="w-24" />
      )}
      <span>◆ LIVE ENTITY GRAPH</span>
      <span>◆ STRUCTURAL CLASSIFIER</span>
      <span>◆ BOUNDED AGENT</span>
      {health ? (
        <span>◆ UPTIME {formatUptime(health.uptime_s)}</span>
      ) : (
        <Skeleton width="w-16" />
      )}
      <span>◆ DOUBLE-ENTRY LEDGER</span>
    </div>
  );
}
