"use client";

import { motion, useReducedMotion } from "framer-motion";
import { type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import GoldButton from "./GoldButton";

/**
 * Glassmorphism form surface: a blurred, gold-bordered card with a soft gold
 * drop shadow. Renders an optional `title`, `children` (the fields — typically
 * GoldInput / GoldTextarea) and a submit GoldButton with `submitLabel`. The
 * form is wrapped in a single onSubmit handler that prevents default reload.
 */
export default function GlassForm({
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Submit",
  submitting = false,
  className,
  footer,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  submitting?: boolean;
  className?: string;
  footer?: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.form
      onSubmit={onSubmit}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={cn(
        "glass flex flex-col gap-4 p-6 shadow-gold",
        className
      )}
    >
      {title && (
        <div>
          <h3 className="font-grotesk text-lg font-bold text-text-primary">{title}</h3>
          {description && (
            <p className="mt-1 text-sm text-text-secondary">{description}</p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-4">{children}</div>
      <div className="flex items-center gap-3 pt-1">
        <GoldButton type="submit" disabled={submitting}>
          {submitting ? "Working…" : submitLabel}
        </GoldButton>
        {footer}
      </div>
    </motion.form>
  );
}
