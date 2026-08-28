"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Analyst } from "@/lib/types";

const STATUS_COLOR: Record<Analyst["status"], string> = {
  online: "var(--color-neon-green)",
  investigating: "var(--color-gold-500)",
  offline: "var(--color-text-muted)",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

/**
 * Horizontally stacked, overlapping analyst avatars. Each avatar scales to 1.15
 * on hover, reveals a name/role tooltip, carries a gradient ring and a status
 * dot. `max` truncates the stack with a "+N" pill.
 */
export default function AvatarList({
  analysts,
  max = 5,
  className,
}: {
  analysts: Analyst[];
  max?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);
  const shown = analysts.slice(0, max);
  const overflow = analysts.length - shown.length;

  return (
    <div className={cn("flex items-center", className)}>
      {shown.map((a, i) => (
        <motion.div
          key={a.id}
          className="relative"
          style={{ marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}
          whileHover={reduced ? undefined : { scale: 1.15, zIndex: 50 }}
          onMouseEnter={() => setActive(a.id)}
          onMouseLeave={() => setActive(null)}
        >
          <div
            className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold text-bg-primary"
            style={{
              background: "linear-gradient(135deg, var(--color-accent), var(--color-entity-vpa))",
              boxShadow: "0 0 0 2px var(--color-bg-secondary)",
            }}
          >
            {initials(a.name)}
          </div>
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-bg-secondary"
            style={{ background: STATUS_COLOR[a.status] }}
          />
          {active === a.id && (
            <div
              className="glass absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 text-center"
              role="tooltip"
            >
              <p className="text-[11px] font-semibold text-text-primary">{a.name}</p>
              <p className="text-[9px] text-text-muted">{a.role}</p>
            </div>
          )}
        </motion.div>
      ))}
      {overflow > 0 && (
        <div
          className="ml-[-8px] grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold text-text-secondary"
          style={{ background: "var(--color-bg-tertiary)", boxShadow: "0 0 0 2px var(--color-bg-secondary)" }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
