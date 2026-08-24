"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { createElement, useRef, type ElementType } from "react";
import { cn } from "@/lib/utils";

type Direction = "up" | "down" | "left" | "right";

const OFFSET: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 16 },
  down: { x: 0, y: -16 },
  left: { x: 16, y: 0 },
  right: { x: -16, y: 0 },
};

/**
 * Staggered text reveal. Splits `text` into characters or words and animates
 * each unit in with a 0.03s offset when scrolled into view. In dark mode the
 * revealed text carries a soft neon glow. `prefers-reduced-motion` shows the
 * text immediately with no transform.
 */
export default function TextReveal({
  text,
  as = "span",
  by = "char",
  direction = "up",
  delay = 0,
  className,
}: {
  text: string;
  as?: ElementType;
  by?: "char" | "word";
  direction?: Direction;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const units = by === "word" ? text.split(/(\s+)/) : Array.from(text);

  if (reduced) {
    const Comp = as as ElementType;
    return <Comp className={className}>{text}</Comp>;
  }

  const off = OFFSET[direction];

  return createElement(
    as as ElementType,
    { ref, className: cn("inline-block", className), "aria-label": text },
    units.map((u, i) => (
      <motion.span
        key={`${u}-${i}`}
        aria-hidden
        className="inline-block whitespace-pre dark:[text-shadow:0_0_18px_var(--color-neon-green)]"
        initial={{ opacity: 0, x: off.x, y: off.y }}
        animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
        transition={{ duration: 0.5, delay: delay + i * 0.03, ease: "easeOut" }}
      >
        {u}
      </motion.span>
    ))
  );
}
