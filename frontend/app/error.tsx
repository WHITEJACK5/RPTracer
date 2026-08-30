"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-bg-primary p-6">
      <div className="glass flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full border border-risk-high/30 bg-risk-high/10 text-risk-high">
          !
        </div>
        <h2 className="font-sans text-lg font-bold text-text-primary">Something went wrong</h2>
        <p className="font-mono text-xs leading-relaxed text-text-secondary">
          A render error occurred. This is a separate layer from per-page data-fetch errors — it catches crashes, not failed API calls.
        </p>
        {error?.message && (
          <p className="max-w-full break-words rounded bg-bg-tertiary px-3 py-2 font-mono text-[11px] text-text-muted">
            {error.message}
          </p>
        )}
        <Button onClick={() => reset()} aria-label="Retry rendering">Retry</Button>
      </div>
    </div>
  );
}
