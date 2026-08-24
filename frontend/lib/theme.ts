"use client";

import { useTheme } from "next-themes";
import { useMemo } from "react";

/**
 * Resolve a value based on the active color scheme.
 *
 * @param light value used when the resolved theme is light
 * @param dark  value used when the resolved theme is dark
 * @returns the value matching `next-themes` `resolvedTheme`
 *
 * @example
 * const dot = useThemeValue("var(--color-ok)", "var(--color-neon-green)");
 */
export function useThemeValue<T>(light: T, dark: T): T {
  const { resolvedTheme } = useTheme();
  return useMemo(
    () => (resolvedTheme === "dark" ? dark : light),
    [resolvedTheme, light, dark]
  );
}
