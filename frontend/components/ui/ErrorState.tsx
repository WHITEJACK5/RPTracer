"use client";

import Button from "./Button";

export default function ErrorState({
  title = "Couldn't load data",
  message,
  onRetry,
  retryLabel = "Retry",
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="glass flex flex-col items-center gap-3 p-8 text-center"
    >
      <div className="grid h-10 w-10 place-items-center rounded-full border border-risk-high/30 bg-risk-high/10 text-risk-high">
        !
      </div>
      <h3 className="font-sans text-sm font-semibold text-text-primary">{title}</h3>
      {message && <p className="max-w-md font-mono text-xs leading-relaxed text-text-secondary">{message}</p>}
      {onRetry && (
        <Button onClick={onRetry} variant="secondary" aria-label={retryLabel}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
