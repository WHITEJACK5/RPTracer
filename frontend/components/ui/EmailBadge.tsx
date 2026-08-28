"use client";

/**
 * Flip-up hover badge (adapted from a Uiverse.io tooltip card, restyled onto
 * the design tokens instead of its original white card — see
 * `.tracer-email-*` in globals.css — so it fits a dark footer). Shows an "@"
 * glyph at rest; on hover/focus a card containing `label` flips up above it.
 * Wraps `href` — pass a `mailto:` link for a real contact address.
 */
export default function EmailBadge({
  href,
  label = "Contact",
}: {
  href: string;
  label?: string;
}) {
  return (
    <a
      href={href}
      className="tracer-email-badge relative inline-flex h-11 w-16 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-border bg-bg-tertiary text-lg font-bold text-text-primary transition-transform"
      aria-label={label}
    >
      @
      <span className="tracer-email-tip pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] border border-border bg-bg-secondary px-3 py-2 text-xs font-semibold text-text-primary opacity-0 shadow-lg transition-all duration-200">
        {label}
      </span>
    </a>
  );
}
