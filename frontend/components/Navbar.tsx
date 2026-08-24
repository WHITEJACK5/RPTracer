"use client";

import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api";
import ThemeToggle from "./layout/ThemeToggle";

/** Landing-page top bar: brand, engine health pill, and theme toggle. */
export default function Navbar() {
  const [health, setHealth] = useState<"up" | "down" | "checking">("checking");

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const h = await fetchHealth();
      if (alive) setHealth(h ? "up" : "down");
    };
    check();
    const t = setInterval(check, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg-primary/70 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-5 px-5">
        <div className="flex items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none" aria-hidden>
            <circle cx="20" cy="20" r="17.5" stroke="var(--color-gold-500)" strokeWidth="1.6" />
            <circle cx="20" cy="20" r="10.5" stroke="var(--color-neon-green)" strokeOpacity="0.5" strokeWidth="1.3" />
            <circle cx="20" cy="20" r="3.4" fill="var(--color-gold-400)" />
            <line x1="20" y1="20" x2="33.5" y2="9.5" stroke="var(--color-neon-green)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="font-grotesk text-xl font-bold tracking-tight text-gradient">TRACER</span>
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-muted">v1.0</span>
        </div>

        <div className="chip ml-3 hidden md:inline-flex !border-neon-green/30 !bg-neon-green/5">
          <span className="h-1.5 w-1.5 rounded-full bg-neon-green animate-glow-breathe" />
          <span className="text-neon-green/90">RAZORPAY AI RISK MANAGER · TRACK 2</span>
        </div>

        <div className="flex-1" />

        <div className="chip">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              health === "up"
                ? "bg-ok shadow-neon"
                : health === "down"
                ? "bg-danger shadow-[0_0_8px_var(--color-danger)]"
                : "bg-text-muted animate-glow-breathe"
            }`}
          />
          <span className="text-text-secondary">ENGINE {health === "up" ? "LIVE" : health.toUpperCase()}</span>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
