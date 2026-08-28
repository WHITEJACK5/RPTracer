"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Accessibility, Bell, Palette, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";

type Item =
  | { label: string; icon: typeof User; href: string }
  | { label: string; icon: typeof User; onSelect: () => void };

/**
 * Icon + label dropdown menu (adapted from a Uiverse.io settings menu,
 * recolored onto the design tokens). Opens from a trigger button in the
 * header; closes on outside click, Escape, or item selection.
 */
export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: Item[] = [
    { label: "Public profile", icon: User, href: "/dashboard/settings" },
    { label: "Account", icon: Settings, href: "/dashboard/settings" },
    {
      label: "Appearance",
      icon: Palette,
      onSelect: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    },
    { label: "Accessibility", icon: Accessibility, href: "/dashboard/settings" },
    { label: "Notifications", icon: Bell, href: "/dashboard/settings" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="grid h-9 w-9 place-items-center rounded-md border border-border bg-surface text-text-secondary transition-colors hover:border-accent hover:text-accent"
      >
        <User size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 flex w-56 flex-col gap-0.5 rounded-[var(--radius-md)] border border-border bg-bg-secondary p-1.5 shadow-lg"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const content = (
              <span
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                )}
              >
                <Icon size={15} className="text-text-muted" />
                {item.label}
              </span>
            );
            return "href" in item ? (
              <Link key={item.label} role="menuitem" href={item.href} onClick={() => setOpen(false)}>
                {content}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  item.onSelect();
                  setOpen(false);
                }}
                className="text-left"
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
