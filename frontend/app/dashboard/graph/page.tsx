"use client";

import { useEffect, useState } from "react";
import { useAnalysts } from "@/hooks/useApi";
import AvatarList from "@/components/ui/AvatarList";
import { Input } from "@/components/ui/Input";
import ErrorState from "@/components/ui/ErrorState";
import Loader from "@/components/ui/Loader";
import Button from "@/components/ui/Button";
import TextReveal from "@/components/ui/TextReveal";
import dynamic from "next/dynamic";

const GraphCanvas = dynamic(() => import("@/components/GraphCanvas"), {
  ssr: false,
  loading: () => (
    <div className="relative h-[460px]">
      <Loader center label="initializing canvas…" />
    </div>
  ),
});

type BurstSession = { id: string; ts: number; total: number; high: number; muleDevices: string[] };

export default function GraphPage() {
  const { data: analysts, isLoading: analystsLoading, isError: analystsError, refetch: refetchAnalysts } = useAnalysts();
  const [override, setOverride] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [sessions, setSessions] = useState<BurstSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>("live");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tracer.burstSessions");
      if (raw) setSessions(JSON.parse(raw));
    } catch {}
    const onStorage = () => {
      try { const r = localStorage.getItem("tracer.burstSessions"); if (r) setSessions(JSON.parse(r)); } catch {}
    };
    window.addEventListener("storage", onStorage);
    const iv = setInterval(() => {
      try { const r = localStorage.getItem("tracer.burstSessions"); if (r) setSessions(JSON.parse(r)); } catch {}
    }, 2000);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(iv); };
  }, [refresh]);

  const center = (() => {
    if (override) return override;
    if (active) return active;
    if (selectedSession !== "live") {
      const s = sessions.find((x) => x.id === selectedSession);
      if (s && s.muleDevices.length > 0) return s.muleDevices[0];
    }
    return undefined;
  })() as string | undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TextReveal as="h1" text="Entity Graph" by="char" className="text-3xl font-bold text-text-primary" />
        {analystsError ? (
          <ErrorState title="Couldn't load analysts" message="Analyst roster unreachable" onRetry={() => refetchAnalysts()} />
        ) : analystsLoading ? (
          <Loader size="sm" />
        ) : (
          <AvatarList analysts={analysts ?? []} className="flex-wrap" />
        )}
      </div>

      <p className="text-sm text-text-secondary">
        Ego-graph around a focal entity. Mule nodes glow red; hover to isolate a node&apos;s neighborhood.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="Center entity (optional)"
          placeholder="Override live center — or leave blank"
          value={override}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOverride(e.target.value)}
          containerClassName="min-w-[260px]"
        />
        <Button
          variant="secondary"
          onClick={() => {
            setActive(override || null);
            setRefresh((n: number) => n + 1);
          }}
        >
          Re-center
        </Button>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Session</label>
          <select
            value={selectedSession}
            onChange={(e) => { setSelectedSession(e.target.value); setRefresh((n) => n + 1); }}
            className="min-w-[220px] rounded-md border border-border bg-bg-tertiary px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent"
          >
            <option value="live">Latest (live) — {sessions.length} sessions</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.ts).toLocaleTimeString()} · {s.total} txns · {s.high} HIGH · {s.id.slice(-6)}
              </option>
            ))}
          </select>
        </div>
        <span className="font-mono text-[11px] text-text-muted">Each burst creates a new session — pick to isolate its ring and avoid cluster overlap.</span>
      </div>

      <GraphCanvas key={`${refresh}-${selectedSession}`} center={center} refreshToken={refresh} session={selectedSession} />
    </div>
  );
}
