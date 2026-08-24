"use client";

import { useReducedMotion as useFramerReducedMotion } from "framer-motion";

/**
 * SSR-safe wrapper around framer-motion's `useReducedMotion`.
 * Returns `true` when the user has requested reduced motion at OS level.
 */
export function useReducedMotion(): boolean {
  const reduced = useFramerReducedMotion();
  return Boolean(reduced);
}
