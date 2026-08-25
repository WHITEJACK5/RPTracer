"use client";

import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "h-5 w-5", border: "border-2" },
  md: { box: "h-8 w-8", border: "border-[3px]" },
  lg: { box: "h-12 w-12", border: "border-4" },
} as const;

/**
 * Themed spinner in accent blue. `size` controls dimensions; `center`
 * absolutely centers it within a relative parent (or the viewport when used
 * standalone). Pure CSS animation — no layout thrash, reduced-motion safe by
 * virtue of being a non-essential decorative loader.
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
  const s = SIZES[size];
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3",
        center && "absolute inset-0 z-10 flex items-center justify-center",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "animate-spin rounded-full border-transparent",
          s.box,
          s.border
        )}
        style={{
          borderTopColor: "var(--color-accent)",
          borderRightColor: "var(--color-accent-hover)",
          boxShadow: "0 0 14px -4px var(--shadow-accent)",
        }}
      />
      {label && <span className="font-mono text-xs text-text-muted">{label}</span>}
      <span className="sr-only">Loading</span>
    </div>
  );
}