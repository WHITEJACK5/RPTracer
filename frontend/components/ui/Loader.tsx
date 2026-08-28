"use client";

import { cn } from "@/lib/utils";

const SIZES = {
  sm: 44,
  md: 64,
  lg: 88,
} as const;

/**
 * Concentric-ring "wifi search" loader (adapted from a Uiverse.io CSS loader,
 * recolored onto the design tokens instead of its original hardcoded hex so
 * it always matches the active theme — see `.tracer-loader-*` in
 * globals.css). `size` controls the ring diameter; `center` absolutely
 * centers it within a relative parent. `label` sets the caption text
 * (defaults to "Loading").
 */
export default function Loader({
  size = "md",
  center = false,
  label,
  className,
}: {
  size?: keyof typeof SIZES;
  center?: boolean;
  label?: string;
  className?: string;
}) {
  const px = SIZES[size];
  const outer = px;
  const middle = px * 0.7;
  const inner = px * 0.4;
  const caption = label ?? "Loading";

  return (
    <div
      className={cn(
        "flex flex-col items-center",
        center && "absolute inset-0 z-10 flex items-center justify-center",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex items-center justify-center" style={{ width: outer, height: outer }}>
        <svg className="absolute" viewBox="0 0 86 86" width={outer} height={outer}>
          <circle className="tracer-loader-back" cx="43" cy="43" r="40" />
          <circle className="tracer-loader-front tracer-loader-outer" cx="43" cy="43" r="40" />
        </svg>
        <svg className="absolute" viewBox="0 0 60 60" width={middle} height={middle}>
          <circle className="tracer-loader-back" cx="30" cy="30" r="27" />
          <circle className="tracer-loader-front tracer-loader-middle" cx="30" cy="30" r="27" />
        </svg>
        <svg className="absolute" viewBox="0 0 34 34" width={inner} height={inner}>
          <circle className="tracer-loader-back" cx="17" cy="17" r="14" />
          <circle className="tracer-loader-front tracer-loader-inner" cx="17" cy="17" r="14" />
        </svg>
      </div>
      <span className="mt-3 font-mono text-xs tracking-wide text-text-muted">{caption}</span>
    </div>
  );
}
