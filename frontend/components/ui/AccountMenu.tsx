"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Accessibility, Bell, LogOut, Palette, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveFeed } from "@/hooks/useLiveFeed";

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
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const { alerts } = useLiveFeed();
  const [profileEmail, setProfileEmail] = useState<string>("analyst@razorpay.com");

  useEffect(() => {
    try { setProfileEmail(localStorage.getItem("tracer.session.email") || "analyst@razorpay.com"); } catch {}
  }, [open, showProfile]);

  useEffect(() => {
    if (!open && !showNotifications && !showProfile) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target) && notifRef.current && !notifRef.current.contains(target) && profileRef.current && !profileRef.current.contains(target)) {
        setOpen(false);
        setShowNotifications(false);
        setShowProfile(false);
      } else if (ref.current && !ref.current.contains(target) && !notifRef.current && !profileRef.current) {
        setOpen(false);
      } else if (notifRef.current && !notifRef.current.contains(target) && !ref.current?.contains(target)) {
        setShowNotifications(false);
      } else if (profileRef.current && !profileRef.current.contains(target) && !ref.current?.contains(target)) {
        setShowProfile(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); setShowNotifications(false); setShowProfile(false); }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, showNotifications, showProfile]);

  const profileName = (() => {
    const base = profileEmail.split("@")[0] || "Analyst";
    return base.split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  })();
  const initials = profileName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "AR";

  const items: Item[] = [
    { label: "Public profile", icon: User, href: "/dashboard/profile" },
    { label: "Account", icon: Settings, href: "/dashboard/account" },
    {
      label: "Appearance",
      icon: Palette,
      onSelect: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    },
    { label: "Accessibility", icon: Accessibility, href: "/dashboard/accessibility" },
    { label: "Notifications", icon: Bell, onSelect: () => { setShowNotifications(true); setOpen(false); } },
  ];

  const signOut: Item = {
    label: "Sign out",
    icon: LogOut,
    onSelect: () => {
      try {
        localStorage.removeItem("tracer.session");
        localStorage.removeItem("tracer.session.email");
      } catch {}
      window.location.href = "/login";
    },
  };

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
      {showNotifications && (
        <div ref={notifRef} className="absolute right-0 top-11 z-50 flex max-h-[420px] w-80 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-bg-secondary shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="flex items-center gap-2 font-sans text-sm font-bold text-text-primary"><Bell size={14} /> Notifications</h3>
            <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[11px] text-accent">{alerts.length} live</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {alerts.length === 0 ? (
              <p className="px-3 py-8 text-center font-mono text-xs text-text-muted">No notifications yet — fire a burst in Sandbox to generate alerts.</p>
            ) : (
              alerts.slice(0, 12).map((a) => (
                <div key={a.id} className="mb-1.5 flex gap-2.5 rounded-md border border-border bg-bg-primary/50 px-3 py-2.5">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${a.level === "alert" ? "bg-danger" : a.level === "warn" ? "bg-gold-500" : a.level === "success" ? "bg-neon-green" : "bg-text-muted"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-semibold text-text-primary">{a.title}</p>
                    <p className="truncate font-mono text-[11px] text-text-muted">{a.detail}</p>
                    <p className="font-mono text-[10px] text-text-muted">{new Date(a.ts).toLocaleTimeString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border bg-bg-tertiary/30 px-3 py-2">
            <span className="font-mono text-[11px] text-text-muted">Synced with Overview · Ledger · Graph</span>
            <button onClick={() => setShowNotifications(false)} className="font-mono text-xs font-medium text-accent hover:underline">Close</button>
          </div>
        </div>
      )}
      {showProfile && (
        <div ref={profileRef} className="absolute right-0 top-11 z-50 flex w-[360px] flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-bg-secondary shadow-xl">
          <div className="relative h-20 bg-gradient-to-r from-accent/20 via-accent/10 to-transparent">
            <div className="absolute -bottom-8 left-5 flex items-end gap-3">
              <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-bg-secondary bg-accent text-lg font-bold text-white shadow-md">{initials}</div>
              <div className="pb-1">
                <h3 className="font-sans text-base font-bold text-text-primary">{profileName}</h3>
                <p className="font-mono text-xs text-text-muted">{profileEmail}</p>
              </div>
            </div>
            <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-risk-low/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-risk-low"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-risk-low" /> ONLINE</span>
          </div>
          <div className="px-5 pb-4 pt-10">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-border bg-bg-tertiary px-2.5 py-1 font-mono text-[11px] text-text-secondary">Risk Analyst</span>
              <span className="rounded-full border border-border bg-bg-tertiary px-2.5 py-1 font-mono text-[11px] text-text-secondary">TRACER Watch</span>
              <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 font-mono text-[11px] font-medium text-accent">Razorpay · Buildathon</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-md border border-border bg-bg-primary/50 p-2.5 text-center">
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Role</p>
                <p className="mt-1 font-mono text-xs font-semibold text-text-primary">Analyst</p>
              </div>
              <div className="rounded-md border border-border bg-bg-primary/50 p-2.5 text-center">
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Access</p>
                <p className="mt-1 font-mono text-xs font-semibold text-accent">Full</p>
              </div>
              <div className="rounded-md border border-border bg-bg-primary/50 p-2.5 text-center">
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Team</p>
                <p className="mt-1 font-mono text-xs font-semibold text-text-primary">Ops</p>
              </div>
            </div>
            <div className="mt-4 space-y-2 rounded-md border border-border bg-bg-primary/40 p-3">
              <div className="flex justify-between font-mono text-xs"><span className="text-text-muted">Work email</span><span className="font-medium text-text-primary">{profileEmail}</span></div>
              <div className="flex justify-between font-mono text-xs"><span className="text-text-muted">Member since</span><span className="text-text-primary">2026 · Buildathon</span></div>
              <div className="flex justify-between font-mono text-xs"><span className="text-text-muted">Auth</span><span className="text-risk-low">Verified · localStorage</span></div>
            </div>
            <div className="mt-4 flex gap-2">
              <Link href="/dashboard/settings" onClick={() => setShowProfile(false)} className="flex-1 rounded-md border border-border bg-bg-tertiary px-3 py-2 text-center font-mono text-xs font-medium text-text-secondary hover:bg-bg-tertiary/80">Manage account</Link>
              <button onClick={() => setShowProfile(false)} className="flex-1 rounded-md bg-accent px-3 py-2 font-mono text-xs font-semibold text-white hover:bg-accent/90">Close</button>
            </div>
          </div>
        </div>
      )}

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
          <div className="my-1 h-px bg-border" role="separator" aria-hidden />
          <button
            type="button"
            role="menuitem"
            aria-label="Sign out"
            onClick={() => {
              signOut.onSelect();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary text-left"
          >
            <LogOut size={15} className="text-text-muted" />
            {signOut.label}
          </button>
        </div>
      )}
    </div>
  );
}
