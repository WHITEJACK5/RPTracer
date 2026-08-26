"use client";

import { useEffect, useRef, useState } from "react";
import { alertStreamUrl, API_BASE } from "@/lib/api";
import type { LiveAlert } from "@/lib/types";

const POLL_URL = `${API_BASE}/api/v1/alerts`;

function seed(): LiveAlert[] {
  return [
    {
      id: "seed-1",
      ts: Date.now(),
      level: "info",
      title: "Risk engine online",
      detail: "TRACER edge scored 0 events in the last window.",
    },
  ];
}

/**
 * Real-time alert feed. Attempts a Server-Sent Events stream first and falls
 * back to short-interval polling when SSE is unavailable (e.g. backend has no
 * stream endpoint). Always degrades gracefully — a disconnected engine never
 * crashes the UI.
 */
export function useLiveFeed(intervalMs = 4000, max = 60): {
  alerts: LiveAlert[];
  connected: boolean;
} {
  const [alerts, setAlerts] = useState<LiveAlert[]>(seed);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function push(a: LiveAlert) {
      setAlerts((prev) => [a, ...prev].slice(0, max));
    }

    // 1) Try SSE
    try {
      const es = new EventSource(alertStreamUrl());
      esRef.current = es;
      es.onopen = () => !cancelled && setConnected(true);
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as LiveAlert;
          if (!cancelled) push(data);
        } catch {
          /* ignore malformed frames */
        }
      };
      es.onerror = () => {
        if (cancelled) return;
        setConnected(false);
        es.close();
        esRef.current = null;
        startPolling();
      };
    } catch {
      startPolling();
    }

    function startPolling() {
      if (pollTimer || cancelled) return;
      setConnected(false);
      pollTimer = setInterval(async () => {
        try {
          const res = await fetch(POLL_URL);
          if (!res.ok) return;
          const batch = (await res.json()) as LiveAlert[];
          if (!cancelled && Array.isArray(batch)) batch.forEach(push);
        } catch {
          /* keep polling silently */
        }
      }, intervalMs);
    }

    return () => {
      cancelled = true;
      if (esRef.current) esRef.current.close();
      if (pollTimer) clearInterval(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, max]);

  return { alerts, connected };
}
