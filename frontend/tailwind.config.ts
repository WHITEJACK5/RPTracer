import type { Config } from "tailwindcss";

/**
 * TRACER design system — all colors resolve to CSS variables (see styles/globals.css)
 * so that light/dark theming is driven entirely by the .dark class on <html>.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./styles/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "bg-primary": "var(--color-bg-primary)",
        "bg-secondary": "var(--color-bg-secondary)",
        "bg-tertiary": "var(--color-bg-tertiary)",
        surface: "var(--color-surface)",
        "surface-strong": "var(--color-surface-strong)",
        border: "var(--color-border)",
        "border-strong": "var(--color-border-strong)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-muted": "var(--color-text-muted)",
        "gold-400": "var(--color-gold-400)",
        "gold-500": "var(--color-gold-500)",
        "gold-600": "var(--color-gold-600)",
        "neon-green": "var(--color-neon-green)",
        "neon-green-soft": "var(--color-neon-green-soft)",
        danger: "var(--color-danger)",
        warn: "var(--color-warn)",
        ok: "var(--color-ok)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        grotesk: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        gold: "var(--shadow-gold)",
        neon: "var(--shadow-neon)",
      },
      animation: {
        "pulse-badge": "pulseBadge 2.2s ease-in-out infinite",
        "glow-breathe": "glowBreathe 3s ease-in-out infinite",
        scanline: "scanline 7s linear infinite",
        blink: "blink 1s step-end infinite",
        "light-sweep": "lightSweep 3s linear infinite",
        shake: "shake 0.4s cubic-bezier(.36,.07,.19,.97) both",
      },
      keyframes: {
        pulseBadge: {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--shadow-neon)" },
          "50%": { boxShadow: "0 0 0 8px rgba(54,240,138,0)" },
        },
        glowBreathe: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(400%)" },
        },
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0" } },
        lightSweep: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        shake: {
          "10%, 90%": { transform: "translateX(-1px)" },
          "20%, 80%": { transform: "translateX(2px)" },
          "30%, 50%, 70%": { transform: "translateX(-4px)" },
          "40%, 60%": { transform: "translateX(4px)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
