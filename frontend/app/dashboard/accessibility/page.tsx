"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import TextReveal from "@/components/ui/TextReveal";

export default function AccessibilityPage() {
  const [fontScale, setFontScale] = useState("100");
  const [highContrast, setHighContrast] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [largeClick, setLargeClick] = useState(false);

  useEffect(() => {
    setFontScale(localStorage.getItem("tracer.a11y.fontScale") ?? "100");
    setHighContrast(localStorage.getItem("tracer.a11y.highContrast") === "1");
    setReduceMotion(localStorage.getItem("tracer.a11y.reduceMotion") === "1");
    setLargeClick(localStorage.getItem("tracer.a11y.largeClick") === "1");
    applyHighContrast(localStorage.getItem("tracer.a11y.highContrast") === "1");
    applyFontScale(localStorage.getItem("tracer.a11y.fontScale") ?? "100");
  }, []);

  function applyFontScale(v: string) {
    document.documentElement.style.fontSize = v === "100" ? "" : `${v}%`;
  }
  function applyHighContrast(on: boolean) {
    document.documentElement.classList.toggle("high-contrast", on);
  }

  function save() {
    localStorage.setItem("tracer.a11y.fontScale", fontScale);
    localStorage.setItem("tracer.a11y.highContrast", highContrast ? "1" : "0");
    localStorage.setItem("tracer.a11y.reduceMotion", reduceMotion ? "1" : "0");
    localStorage.setItem("tracer.a11y.largeClick", largeClick ? "1" : "0");
    applyFontScale(fontScale);
    applyHighContrast(highContrast);
    if (reduceMotion) document.documentElement.style.setProperty("--motion-duration", "0.01ms");
    else document.documentElement.style.removeProperty("--motion-duration");
    toast.success("Accessibility saved", { description: `Font ${fontScale}% · ${highContrast ? "High contrast" : "Standard"} · ${reduceMotion ? "Reduce motion" : "Motion on"}` });
  }

  function reset() {
    setFontScale("100"); setHighContrast(false); setReduceMotion(false); setLargeClick(false);
    localStorage.removeItem("tracer.a11y.fontScale");
    localStorage.removeItem("tracer.a11y.highContrast");
    localStorage.removeItem("tracer.a11y.reduceMotion");
    localStorage.removeItem("tracer.a11y.largeClick");
    document.documentElement.style.fontSize = "";
    document.documentElement.classList.remove("high-contrast");
    toast.success("Accessibility reset");
  }

  return (
    <div className="flex flex-col gap-6">
      <TextReveal as="h1" text="Accessibility" by="char" className="font-sans text-3xl font-bold text-text-primary" />
      <p className="text-sm text-text-secondary">Tune TRACER for your needs — all settings persist in localStorage and apply instantly.</p>

      <div className="glass flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-2">
          <label className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">Font scale</label>
          <div className="flex items-center gap-3">
            <input type="range" min={85} max={130} step={5} value={fontScale} onChange={(e) => setFontScale(e.target.value)} className="flex-1 accent-accent" />
            <span className="w-14 rounded-md border border-border bg-bg-tertiary px-2 py-1.5 text-center font-mono text-sm text-text-primary">{fontScale}%</span>
          </div>
          <p className="font-mono text-[11px] text-text-muted">Scales root font-size · live preview on save</p>
        </div>

        <label className="flex items-center justify-between rounded-md border border-border bg-bg-primary/40 px-4 py-3">
          <div><p className="font-mono text-sm font-medium text-text-primary">High contrast</p><p className="font-mono text-xs text-text-muted">Increase border and text contrast</p></div>
          <input type="checkbox" checked={highContrast} onChange={(e) => setHighContrast(e.target.checked)} className="h-5 w-10 accent-accent" />
        </label>

        <label className="flex items-center justify-between rounded-md border border-border bg-bg-primary/40 px-4 py-3">
          <div><p className="font-mono text-sm font-medium text-text-primary">Reduce motion</p><p className="font-mono text-xs text-text-muted">Disable glow and slide animations</p></div>
          <input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} className="h-5 w-10 accent-accent" />
        </label>

        <label className="flex items-center justify-between rounded-md border border-border bg-bg-primary/40 px-4 py-3">
          <div><p className="font-mono text-sm font-medium text-text-primary">Large click targets</p><p className="font-mono text-xs text-text-muted">Increase button padding</p></div>
          <input type="checkbox" checked={largeClick} onChange={(e) => setLargeClick(e.target.checked)} className="h-5 w-10 accent-accent" />
        </label>

        <div className="flex gap-3">
          <button onClick={save} className="rounded-md bg-accent px-5 py-2.5 font-mono text-sm font-semibold text-white hover:bg-accent/90">Save preferences</button>
          <button onClick={reset} className="rounded-md border border-border bg-bg-tertiary px-5 py-2.5 font-mono text-sm font-medium text-text-secondary hover:bg-bg-tertiary/80">Reset</button>
        </div>
      </div>
    </div>
  );
}
