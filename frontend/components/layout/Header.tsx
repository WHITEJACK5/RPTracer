"use client";

import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

/** Top app bar: brand, optional nav links, and the light/dark theme toggle. */
export default function Header({
  links,
}: {
  links?: { href: string; label: string }[];
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg-primary/70 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-5 px-5">
        <Link href="/" className="flex items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none" aria-hidden>
            <circle cx="20" cy="20" r="17.5" stroke="var(--color-gold-500)" strokeWidth="1.6" />
            <circle cx="20" cy="20" r="10.5" stroke="var(--color-neon-green)" strokeOpacity="0.5" strokeWidth="1.3" />
            <circle cx="20" cy="20" r="3.4" fill="var(--color-gold-400)" />
            <line x1="20" y1="20" x2="33.5" y2="9.5" stroke="var(--color-neon-green)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="font-sans text-xl font-bold tracking-tight text-gradient">TRACER</span>
        </Link>

        {links && links.length > 0 && (
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex-1" />
        <ThemeToggle />
      </div>
    </header>
  );
}
