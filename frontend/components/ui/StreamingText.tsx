"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

/**
 * Typewriter renderer. Reveals `text` one character at a time at `speed` ms
 * (10ms for logs, 30ms for dossiers). A blinking neon-green cursor trails the
 * output and fades 500ms after completion. When `markdown` is set the revealed
 * buffer is rendered through react-markdown. Exposes `aria-live="polite"` for
 * screen readers. Honors `prefers-reduced-motion` (renders instantly).
 */
export default function StreamingText({
  text,
  speed = 30,
  markdown = false,
  className,
  ariaLabel,
  onDone,
}: {
  text: string;
  speed?: number;
  markdown?: boolean;
  className?: string;
  ariaLabel?: string;
  onDone?: () => void;
}) {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(reduced ? text.length : 0);
  const [cursorFaded, setCursorFaded] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (reduced) {
      setCount(text.length);
      return;
    }
    setCount(0);
    setCursorFaded(false);
    doneRef.current = false;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) {
        clearInterval(id);
        setTimeout(() => {
          setCursorFaded(true);
          if (!doneRef.current) {
            doneRef.current = true;
            onDone?.();
          }
        }, 500);
      }
    }, speed);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed, reduced]);

  const shown = text.slice(0, count);

  return (
    <div
      className={cn("font-mono text-sm leading-relaxed text-text-secondary", className)}
      aria-live="polite"
      aria-label={ariaLabel ?? text}
    >
      {markdown ? (
        <div className="prose-invert max-w-none">
          <ReactMarkdown
            components={{
              a: ({ ...p }) => <a {...p} className="text-risk-low underline" />,
              strong: ({ ...p }) => <strong {...p} className="text-text-primary" />,
              code: ({ ...p }) => (
                <code {...p} className="rounded bg-bg-tertiary px-1 text-accent" />
              ),
            }}
          >
            {shown}
          </ReactMarkdown>
        </div>
      ) : (
        shown
      )}
      {!reduced && !cursorFaded && (
        <span className="ml-0.5 inline-block animate-blink text-risk-low">▊</span>
      )}
    </div>
  );
}
