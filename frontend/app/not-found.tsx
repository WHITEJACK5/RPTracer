import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-bg-primary p-6">
      <div className="glass flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">404 — Not found</p>
        <h2 className="font-sans text-2xl font-bold text-text-primary">This page could not be found</h2>
        <p className="font-mono text-xs text-text-secondary">The URL you visited doesn&apos;t match any route in this app.</p>
        <div className="flex gap-3">
          <Link href="/" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover" aria-label="Go home">
            Home
          </Link>
          <Link href="/dashboard" className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-tertiary" aria-label="Go to dashboard">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
