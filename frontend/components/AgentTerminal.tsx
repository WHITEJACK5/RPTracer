"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentTraceStep } from "@/lib/types";

type Line = { level: string; text: string };

const TICK_MS = 14;
const CHARS_PER_TICK = 4;

const LEVEL_COLOR: Record<string, string> = {
  info: "var(--color-text-muted)",
  success: "var(--color-neon-green)",
  warn: "var(--color-gold-500)",
  alert: "var(--color-danger)",
};

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

/** Streaming agent decision log. */
export default function AgentTerminal({ trace, runKey }: { trace: AgentTraceStep[] | null; runKey: number }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [partial, setPartial] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines([]);
    setPartial("");
    if (!trace || trace.length === 0) {
      setStreaming(false);
      return;
    }
    const queue: Line[] = trace.map((t) => ({
      level: t.level,
      text: `[${fmtTime(t.ts_ms)}] ▸ ${t.actor.toUpperCase().padEnd(6)} :: ${t.message}`,
    }));
    let cur: Line | null = null;
    let ci = 0;
    setStreaming(true);
    const iv = setInterval(() => {
      if (!cur) {
        cur = queue.shift() ?? null;
        ci = 0;
        if (!cur) {
          clearInterval(iv);
          setStreaming(false);
          return;
        }
      }
      ci += CHARS_PER_TICK;
      setPartial(cur.text.slice(0, ci));
      if (ci >= cur.text.length) {
        const done = cur;
        setLines((prev) => [...prev.slice(-80), done]);
        setPartial("");
        cur = null;
      }
    }, TICK_MS);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, partial]);

  return (
    <section className="glass relative flex min-h-[420px] flex-col overflow-hidden p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-grotesk text-sm font-semibold tracking-widest text-text-muted">AGENT TERMINAL</h2>
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-wider">
          <span className={`h-1.5 w-1.5 rounded-full ${streaming ? "bg-neon-green animate-glow-breathe" : "bg-text-muted"}`} />
          <span className={streaming ? "text-neon-green" : "text-text-muted"}>{streaming ? "STREAMING" : lines.length ? "COMPLETE" : "IDLE"}</span>
        </div>
      </div>

      <div ref={scrollRef} className="terminal-scroll relative flex-1 overflow-y-auto rounded-md border border-border bg-bg-primary/40 p-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-bg-primary/60 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-neon-green/[0.04] to-transparent animate-scanline" />

        {lines.length === 0 && !partial ? (
          <p className="py-10 text-center font-mono text-[11px] text-text-muted">
            $ tracer --watch agent-decisions…
            <br />awaiting first event ingestion_
          </p>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.7]">
            {lines.map((l, i) => (
              <div key={i} style={{ color: LEVEL_COLOR[l.level] ?? "var(--color-text-muted)" }}>{l.text}</div>
            ))}
            {partial && (
              <span style={{ color: LEVEL_COLOR.info }}>
                {partial}
                <span className="animate-blink text-neon-green">▊</span>
              </span>
            )}
            {!streaming && lines.length > 0 && <span className="text-neon-green">▊</span>}
          </pre>
        )}
      </div>
    </section>
  );
}
