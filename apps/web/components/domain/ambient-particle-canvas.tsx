"use client";

import { useEffect, useRef } from "react";
import type { SoundPreset } from "@/lib/domain/soundscapes";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

/**
 * Lightweight 60fps HTML5 Canvas ambient particle system for Focus Studio 2.0.
 * Automatically pauses when the tab is hidden or when prefers-reduced-motion is set.
 */
export function AmbientParticleCanvas({ preset }: { preset: SoundPreset }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      width = parent ? parent.clientWidth : window.innerWidth;
      height = parent ? parent.clientHeight : window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    resize();
    window.addEventListener("resize", resize);

    const isRain = preset === "rain" || preset === "ocean";
    const isEmber = preset === "fireplace" || preset === "cafe";
    const isFirefly = preset === "forest";
    const count = isRain ? 75 : 36;

    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: isRain ? -1.4 - Math.random() * 0.8 : (Math.random() - 0.5) * 0.45,
      vy: isRain
        ? 7 + Math.random() * 5
        : isEmber
          ? -(0.45 + Math.random() * 0.8)
          : (Math.random() - 0.5) * 0.35,
      size: isRain ? 10 + Math.random() * 10 : 1.5 + Math.random() * 2.5,
      alpha: 0.2 + Math.random() * 0.55,
    }));

    const draw = () => {
      if (document.visibilityState === "visible") {
        ctx.clearRect(0, 0, width, height);
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;

          if (p.x < -20) p.x = width + 20;
          if (p.x > width + 20) p.x = -20;
          if (p.y < -20) p.y = height + 20;
          if (p.y > height + 20) p.y = -20;

          if (isRain) {
            ctx.strokeStyle = `rgba(186, 230, 253, ${p.alpha * 0.45})`;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.vx * 1.4, p.y + p.size);
            ctx.stroke();
          } else {
            const color = isEmber
              ? `rgba(251, 146, 60, ${p.alpha})`
              : isFirefly
                ? `rgba(110, 231, 183, ${p.alpha})`
                : `rgba(255, 245, 238, ${p.alpha * 0.55})`;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [preset]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-80"
    />
  );
}
