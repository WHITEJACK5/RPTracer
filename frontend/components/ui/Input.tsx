"use client";

import { motion, useReducedMotion } from "framer-motion";
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type CommonProps = {
  label?: string;
  error?: string | null;
  hint?: string;
  containerClassName?: string;
};

const baseField =
  "w-full rounded-md bg-bg-tertiary/60 px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors";

type InputProps = InputHTMLAttributes<HTMLInputElement> & CommonProps;

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, containerClassName, ...rest }, ref) => {
    const reduced = useReducedMotion();
    return (
      <label className={cn("block", containerClassName)}>
        {label && (
          <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {label}
          </span>
        )}
        <motion.div
          animate={error && !reduced ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-md"
          style={{
            boxShadow: error
              ? "0 0 0 1px var(--color-risk-high), 0 0 16px -6px var(--color-risk-high)"
              : "0 0 0 1px var(--color-border)",
          }}
        >
          <input
            ref={ref}
            className={cn(
              baseField,
              "border border-transparent focus:border-accent focus:shadow-accent",
              error && "border-risk-high focus:border-risk-high",
              className
            )}
            aria-invalid={Boolean(error)}
            {...rest}
          />
        </motion.div>
        {error ? (
          <span className="mt-1 block font-mono text-[11px] text-risk-high">{error}</span>
        ) : hint ? (
          <span className="mt-1 block font-mono text-[11px] text-text-muted">{hint}</span>
        ) : null}
      </label>
    );
  }
);
Input.displayName = "Input";

const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & CommonProps
>(({ label, error, hint, className, containerClassName, ...rest }, ref) => (
  <label className={cn("block", containerClassName)}>
    {label && (
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
    )}
    <textarea
      ref={ref}
      className={cn(
        baseField,
        "terminal-scroll resize-none border border-transparent focus:border-accent focus:shadow-accent",
        error && "border-risk-high focus:border-risk-high",
        className
      )}
      aria-invalid={Boolean(error)}
      {...rest}
    />
    {error ? (
      <span className="mt-1 block font-mono text-[11px] text-risk-high">{error}</span>
    ) : hint ? (
      <span className="mt-1 block font-mono text-[11px] text-text-muted">{hint}</span>
    ) : null}
  </label>
));
Textarea.displayName = "Textarea";

export { Input, Textarea };
export default Input;