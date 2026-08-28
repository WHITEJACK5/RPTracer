"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Fixed 3px accent bar pinned to the top of the viewport. A gradient sweep
 * (transparent → accent → entity-vpa → transparent) travels left→right every
 * 3s and emits a neon glow in dark mode. Honors `prefers-reduced-motion`.
 */
export default function LightBar({ className }: { className?: string }) {
  const reduced = useReducedMotion();

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden",
        "bg-border",
        className
      )}
    >
      {reduced ? (
        <div className="h-full w-full bg-gradient-to-r from-transparent via-accent to-entity-vpa opacity-70" />
      ) : (
        <motion.div
          className="h-full w-full"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, var(--color-accent) 45%, var(--color-entity-vpa) 55%, transparent 100%)",
            boxShadow: "0 0 12px 1px var(--shadow-accent)",
          }}
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
      )}
    </div>
  );
}
