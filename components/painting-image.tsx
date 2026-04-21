// =======================================================================
// <PaintingImage> — renders a real photograph from Supabase Storage when one
// exists on the painting, and falls back to a generated painterly SVG
// placeholder until Robert's real photos are uploaded.
// =======================================================================
"use client";

import { useMemo } from "react";
import type { Painting } from "@/lib/types";

type Props = {
  painting: Painting;
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

function seeded(seed: string) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s >>> 0) / 4294967296;
  };
}

export default function PaintingImage({
  painting,
  priority,
  className,
  style,
}: Props) {
  const primary = painting.images?.find((i) => i.is_primary) ?? painting.images?.[0];
  const aspect = painting.aspect || painting.w / painting.h;

  // Generated placeholder data — memoized so the same painting always looks the same.
  const placeholder = useMemo(() => {
    if (primary) return null;
    const W = 400;
    const H = Math.round(W / aspect);
    const palette = painting.palette ?? ["#D4C39E", "#8E7448", "#EADFC0", "#3A2E20"];
    const [c0, c1, c2, c3] = palette;
    const rnd = seeded(painting.id);

    const bands: { y: number; h: number; color: string; skew: number }[] = [];
    const nb = 4 + Math.floor(rnd() * 3);
    let y = 0;
    for (let i = 0; i < nb; i++) {
      const h = (H / nb) * (0.6 + rnd() * 0.9);
      bands.push({
        y,
        h,
        color: [c0, c1, c2, c3][Math.floor(rnd() * 4)],
        skew: (rnd() - 0.5) * 30,
      });
      y += h * 0.85;
    }

    const blocks: { x: number; y: number; w: number; h: number; color: string; opacity: number; rot: number }[] = [];
    const nk = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < nk; i++) {
      blocks.push({
        x: rnd() * W,
        y: rnd() * H,
        w: 40 + rnd() * W * 0.5,
        h: 20 + rnd() * H * 0.4,
        color: [c0, c1, c2, c3][Math.floor(rnd() * 4)],
        opacity: 0.3 + rnd() * 0.5,
        rot: (rnd() - 0.5) * 20,
      });
    }

    const lines: { x1: number; y1: number; x2: number; y2: number; opacity: number; sw: number }[] = [];
    const nl = 3 + Math.floor(rnd() * 4);
    for (let i = 0; i < nl; i++) {
      lines.push({
        x1: rnd() * W,
        y1: rnd() * H,
        x2: rnd() * W,
        y2: rnd() * H,
        opacity: 0.15 + rnd() * 0.2,
        sw: 0.5 + rnd() * 1.5,
      });
    }

    return { W, H, c0, c1, c2, c3, bands, blocks, lines };
  }, [painting.id, painting.palette, aspect, primary]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${painting.w} / ${painting.h}`,
        background: painting.palette?.[2] ?? "var(--paper-2)",
        overflow: "hidden",
        ...style,
      }}
    >
      {primary ? (
        <img
          src={primary.url}
          alt={primary.alt ?? `${painting.title}, ${painting.year}`}
          loading={priority ? "eager" : "lazy"}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : placeholder ? (
        <svg
          viewBox={`0 0 ${placeholder.W} ${placeholder.H}`}
          preserveAspectRatio="xMidYMid slice"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          aria-hidden
        >
          <defs>
            <filter id={`grain-${painting.id}`}>
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={painting.id.length} />
              <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.08 0" />
              <feComposite in2="SourceGraphic" operator="in" />
            </filter>
            <linearGradient id={`g-${painting.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={placeholder.c2} />
              <stop offset="100%" stopColor={placeholder.c0} />
            </linearGradient>
            <radialGradient id={`v-${painting.id}`} cx="0.5" cy="0.5" r="0.7">
              <stop offset="60%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.25)" />
            </radialGradient>
          </defs>
          <rect width={placeholder.W} height={placeholder.H} fill={`url(#g-${painting.id})`} />
          {placeholder.bands.map((b, i) => (
            <rect
              key={`b${i}`}
              x={-20}
              y={b.y}
              width={placeholder.W + 40}
              height={b.h}
              fill={b.color}
              opacity={0.55}
              transform={`skewY(${b.skew / 8})`}
            />
          ))}
          {placeholder.blocks.map((bl, i) => (
            <rect
              key={`k${i}`}
              x={bl.x}
              y={bl.y}
              width={bl.w}
              height={bl.h}
              fill={bl.color}
              opacity={bl.opacity}
              transform={`rotate(${bl.rot} ${bl.x + bl.w / 2} ${bl.y + bl.h / 2})`}
            />
          ))}
          {placeholder.lines.map((l, i) => (
            <line
              key={`l${i}`}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={placeholder.c3}
              strokeWidth={l.sw}
              opacity={l.opacity}
            />
          ))}
          <rect
            width={placeholder.W}
            height={placeholder.H}
            fill="black"
            filter={`url(#grain-${painting.id})`}
            opacity={0.4}
          />
          <rect width={placeholder.W} height={placeholder.H} fill={`url(#v-${painting.id})`} />
        </svg>
      ) : null}

      {painting.status === "sold" && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            background: "rgba(28,25,21,0.85)",
            color: "var(--paper)",
            fontSize: 9.5,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            padding: "4px 8px",
            fontWeight: 500,
          }}
        >
          Sold
        </div>
      )}
    </div>
  );
}
