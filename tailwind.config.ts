import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#07070b",
        glass: "rgba(18,18,26,0.7)",
        line: "rgba(255,255,255,0.08)",
        teal: { glow: "#00d4aa" },
        violet: { glow: "#a855f7" },
        danger: "#ef4444",
        warn: "#f97316",
        ok: "#34c759",
      },
      fontFamily: {
        grotesk: ["var(--font-grotesk)", "sans-serif"],
        inter: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      animation: {
        "pulse-badge": "pulseBadge 2.2s ease-in-out infinite",
        "glow-breathe": "glowBreathe 3s ease-in-out infinite",
        scanline: "scanline 7s linear infinite",
        blink: "blink 1s step-end infinite",
      },
      keyframes: {
        pulseBadge: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(0,212,170,0.45)" },
          "50%": { boxShadow: "0 0 0 8px rgba(0,212,170,0)" },
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
      },
    },
  },
  plugins: [],
};
export default config;
