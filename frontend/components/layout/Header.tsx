"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { NAV } from "@/components/layout/Sidebar";
import ThemeToggle from "./ThemeToggle";
import MenuButton from "@/components/ui/MenuButton";
import AccountMenu from "@/components/ui/AccountMenu";
import { cn } from "@/lib/utils";

/** Top app bar: brand, optional nav links, theme toggle, and mobile hamburger. */
export default function Header({
  links,
}: {
  links?: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [drawerOpen]);

  // Focus trap: focus first link when drawer opens
  useEffect(() => {
    if (drawerOpen) {
      setTimeout(() => firstLinkRef.current?.focus(), 50);
    }
  }, [drawerOpen]);

  // Prevent body scroll when drawer open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-bg-primary/70 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-5 px-5">
          <Link href="/" className="flex items-center gap-1.5">
            <Image src="/logo.png" alt="TRACER logo" width={56} height={56} className="h-14 w-14 object-contain" priority />
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
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary md:inline-flex"
              aria-label="Sign in"
            >
              Sign in
            </Link>
            <ThemeToggle />
            <AccountMenu />
          </div>

          {/* Hamburger — visible below md */}
          <MenuButton open={drawerOpen} onClick={() => setDrawerOpen(!drawerOpen)} />
        </div>
      </header>

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <nav
        ref={drawerRef}
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-64 flex-col border-l border-border bg-bg-secondary px-4 py-6 shadow-lg transition-transform duration-200 md:hidden",
          drawerOpen ? "translate-x-0" : "translate-x-full"
        )}
        aria-label="Mobile navigation"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-text-primary">Navigation</span>
          <button
            className="rounded p-1 text-text-secondary hover:bg-bg-tertiary"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }, idx) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                ref={idx === 0 ? firstLinkRef : undefined}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-surface text-text-primary shadow-accent"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                )}
              >
                <Icon size={17} className={active ? "text-accent" : ""} />
                {label}
              </Link>
            );
          })}
          <Link
            href="/login"
            onClick={() => setDrawerOpen(false)}
            className="mt-3 flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
            aria-label="Sign in"
          >
            Sign in
          </Link>
        </div>
      </nav>
    </>
  );
}
