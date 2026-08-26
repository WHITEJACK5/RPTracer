import type { Config } from "tailwindcss";

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
        border: "var(--color-border)",
        "border-strong": "var(--color-border-strong)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-muted": "var(--color-text-muted)",
        accent: "var(--color-accent)",
        "accent-hover": "var(--color-accent-hover)",
        "risk-low": "var(--color-risk-low)",
        "risk-medium": "var(--color-risk-medium)",
        "risk-high": "var(--color-risk-high)",
        "entity-device": "var(--color-entity-device)",
        "entity-vpa": "var(--color-entity-vpa)",
        "entity-card": "var(--color-entity-card)",
        "entity-ip": "var(--color-entity-ip)",
        "entity-email": "var(--color-entity-email)",
        "entity-customer": "var(--color-entity-customer)",
        "entity-mule": "var(--color-entity-mule)",
        danger: "var(--color-danger)",
        ok: "var(--color-ok)",
        warn: "var(--color-warn)",
        "neon-green": "var(--color-neon-green)",
        "gold-400": "var(--color-gold-400)",
        "gold-500": "var(--color-gold-500)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        accent: "var(--shadow-accent)",
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
          "0%, 100%": { boxShadow: "0 0 0 0 var(--shadow-accent)" },
          "50%": { boxShadow: "0 0 0 8px rgba(59,130,246,0)" },
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
  plugins: [require("@tailwindcss/typography")],
};
export default config;