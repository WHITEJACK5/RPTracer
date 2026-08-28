"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Pill toggle switch (adapted from a Uiverse.io CSS toggle, recolored onto
 * the design tokens — see `.tracer-toggle-*` in globals.css) that flips
 * between light and dark via next-themes. The knob position and track color
 * both derive from the checkbox's `:checked` state via sibling selectors.
 */
export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? resolvedTheme === "dark" : true;

  return (
    <label
      className="tracer-toggle relative inline-flex h-8 w-14 cursor-pointer items-center rounded-full border border-border transition-colors"
      aria-label="Toggle color theme"
    >
      <input
        type="checkbox"
        className="tracer-toggle-peer sr-only"
        checked={isDark}
        onChange={() => setTheme(isDark ? "light" : "dark")}
      />
      <span className="tracer-toggle-track absolute inset-0 rounded-full transition-colors" />
      <span className="tracer-toggle-knob relative z-10 ml-1 h-6 w-6 rounded-full shadow transition-transform" />
    </label>
  );
}
