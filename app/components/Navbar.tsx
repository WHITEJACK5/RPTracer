"use client";

import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api";

export default function Navbar({ lastLatency }: { lastLatency?: number | null }) {
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
    <header className="sticky top-0 z-40 border-b border-line bg-[rgba(7,7,11,0.72)] backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-5 px-5">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <svg width="34" height="34" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="17.5" stroke="url(#rg)" strokeWidth="1.6" />
            <circle cx="20" cy="20" r="10.5" stroke="rgba(0,212,170,0.45)" strokeWidth="1.3" />
            <circle cx="20" cy="20" r="3.4" fill="#00d4aa" />
            <line x1="20" y1="20" x2="33.5" y2="9.5" stroke="#a855f7" strokeWidth="1.8" strokeLinecap="round" />
            <defs>
              <linearGradient id="rg" x1="0" y1="0" x2="40" y2="40">
                <stop stopColor="#00d4aa" />
                <stop offset="1" stopColor="#a855f7" />
              </linearGradient>
            </defs>
          </svg>
          <div className="leading-none">
            <span className="font-grotesk text-xl font-bold tracking-tight text-gradient">TRACER</span>
            <span className="ml-2 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-white/60">
              v1.0
            </span>
          </div>
        </div>

        {/* Track badge */}
        <div className="chip animate-pulse-badge hidden md:inline-flex !border-teal-glow/30 !bg-teal-glow/5">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-glow animate-glow-breathe" />
          <span className="text-teal-glow/90">RAZORPAY AI RISK MANAGER · TRACK 2</span>
        </div>

        <div className="flex-1" />

        {/* SLA pill */}
        {lastLatency != null && (
          <div className="chip hidden sm:inline-flex font-mono">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v3M6 8v3M1 6h3M8 6h3" stroke={lastLatency <= 50 ? "#00d4aa" : "#f97316"} strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span style={{ color: lastLatency <= 50 ? "#00d4aa" : "#f97316" }}>
              {lastLatency.toFixed(1)}ms · SLA {lastLatency <= 50 ? "PASS" : "MISS"}
            </span>
          </div>
        )}

        {/* Engine health */}
        <div className="chip">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              health === "up" ? "bg-ok shadow-[0_0_8px_#34c759]" :
              health === "down" ? "bg-danger shadow-[0_0_8px_#ef4444]" :
              "bg-white/40 animate-glow-breathe"
            }`}
          />
          <span className="text-white/70">ENGINE {health === "up" ? "LIVE" : health.toUpperCase()}</span>
        </div>
      </div>
    </header>
  );
}
