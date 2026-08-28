"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Ambient dot-field background. Renders a 40px grid of 4px dots on a <canvas>;
 * dots within 200px of the cursor brighten and shift luminance from the
 * accent color toward the vpa entity color (both read live from CSS custom
 * properties, so light/dark and any future palette change are picked up
 * automatically), with stronger glow in dark mode. Animation runs on a
 * throttled requestAnimationFrame loop and pauses entirely under
 * `prefers-reduced-motion` (a single static grid is drawn).
 */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export default function DotBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const GAP = 40;
    const DOT = 4;
    const RADIUS = 200;
    let raf = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: -9999, y: -9999 };
    let needsDraw = true;
    let from: [number, number, number] = [25, 118, 210];
    let to: [number, number, number] = [2, 136, 209];

    function readPalette() {
      const styles = getComputedStyle(document.documentElement);
      const accent = styles.getPropertyValue("--color-accent").trim();
      const vpa = styles.getPropertyValue("--color-entity-vpa").trim();
      if (accent) from = hexToRgb(accent);
      if (vpa) to = hexToRgb(vpa);
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.floor(window.innerWidth * dpr);
      canvas!.height = Math.floor(window.innerHeight * dpr);
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
      needsDraw = true;
    }

    function colorAt(dx: number, dy: number, dark: boolean) {
      const dist = Math.hypot(dx, dy);
      const t = Math.max(0, 1 - dist / RADIUS); // 1 near cursor → 0 far
      const alpha = 0.12 + t * (dark ? 0.85 : 0.6);
      const r = Math.round(from[0] + (to[0] - from[0]) * t);
      const g = Math.round(from[1] + (to[1] - from[1]) * t);
      const b = Math.round(from[2] + (to[2] - from[2]) * t);
      const glow = t * (dark ? 14 : 8);
      return { rgb: `${r},${g},${b}`, alpha, glow };
    }

    function draw() {
      readPalette();
      const dark = document.documentElement.classList.contains("dark");
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      const w = canvas!.width;
      const h = canvas!.height;
      for (let x = GAP; x < w; x += GAP) {
        for (let y = GAP; y < h; y += GAP) {
          const dx = x - mouse.x * dpr;
          const dy = y - mouse.y * dpr;
          const c = colorAt(dx, dy, dark);
          ctx!.beginPath();
          ctx!.fillStyle = `rgba(${c.rgb},${c.alpha})`;
          if (c.glow > 0) {
            ctx!.shadowBlur = c.glow;
            ctx!.shadowColor = `rgba(${c.rgb},${c.alpha})`;
          } else {
            ctx!.shadowBlur = 0;
          }
          ctx!.arc(x, y, (DOT * dpr) / 2, 0, Math.PI * 2);
          ctx!.fill();
        }
      }
      ctx!.shadowBlur = 0;
    }

    function loop() {
      if (needsDraw) {
        draw();
        needsDraw = false;
      }
      raf = requestAnimationFrame(loop);
    }

    function onMove(e: PointerEvent) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      needsDraw = true;
    }
    function onLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
      needsDraw = true;
    }

    resize();
    window.addEventListener("resize", resize);

    if (reduced) {
      draw(); // single static frame
    } else {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerleave", onLeave);
      loop();
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className ?? "pointer-events-none fixed inset-0 -z-10 h-full w-full"}
    />
  );
}
