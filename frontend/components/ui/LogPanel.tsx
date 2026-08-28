"use client";

import type { ReactNode } from "react";

/**
 * Windowed console panel with a title bar and line-numbered gutter (adapted
 * from a Uiverse.io retro code-card, restyled onto the design tokens instead
 * of its original Windows-98 chrome — see `.tracer-log-*` in globals.css —
 * so it fits a modern dark dashboard). Renders `children` as the log body;
 * pass `lineCount` to size the gutter.
 */
export default function LogPanel({
  title,
  lineCount = 8,
  children,
}: {
  title: string;
  lineCount?: number;
  children: ReactNode;
}) {
  return (
    <div className="tracer-log-panel overflow-hidden rounded-[var(--radius-md)] border border-border">
      <div className="tracer-log-titlebar flex items-center gap-2 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-risk-high)" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-risk-medium)" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-risk-low)" }} />
        <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-text-secondary">
          {title}
        </span>
      </div>
      <div className="flex">
        <div
          aria-hidden
          className="tracer-log-gutter select-none px-2 py-3 text-right font-mono text-[11px] leading-6 text-text-muted"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto px-3 py-3 font-mono text-[12px] leading-6 text-text-secondary">
          {children}
        </div>
      </div>
    </div>
  );
}
