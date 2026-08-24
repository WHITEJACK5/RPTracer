"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";

/**
 * Wraps the app in next-themes. Uses the `class` strategy (toggling `.dark` on
 * <html>), defaults to the OS preference, and persists the choice under
 * `tracer-theme`. The root <html> must set `suppressHydrationWarning`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      storageKey="tracer-theme"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  );
}
