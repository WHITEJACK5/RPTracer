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

/**
 * Underline-style input with a floating label (adapted from a Uiverse.io
 * input, recolored onto the design tokens). The label sits inline as
 * placeholder text until focused or filled, then floats above the line —
 * a lighter-weight look than the boxed `Input` for dense filter bars.
 */
const FloatingInput = forwardRef<HTMLInputElement, InputProps>(
  ({ label, className, id, ...rest }, ref) => {
    const inputId = id ?? `floating-${label?.replace(/\s+/g, "-").toLowerCase() ?? "input"}`;
    return (
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          placeholder=" "
          className={cn(
            "peer w-full border-b border-border bg-transparent px-0.5 py-2 text-sm text-text-primary outline-none transition-colors focus:border-b-2 focus:border-accent",
            className
          )}
          {...rest}
        />
        {label && (
          <label
            htmlFor={inputId}
            className="pointer-events-none absolute left-0.5 top-2 text-sm text-text-muted transition-all peer-focus:-top-3.5 peer-focus:text-xs peer-focus:text-accent peer-[:not(:placeholder-shown)]:-top-3.5 peer-[:not(:placeholder-shown)]:text-xs"
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);
FloatingInput.displayName = "FloatingInput";

export { Input, Textarea, FloatingInput };
export default Input;