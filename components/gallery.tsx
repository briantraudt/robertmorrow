"use client";

import { useState } from "react";
import Link from "next/link";
import PaintingImage from "./painting-image";
import { useCart } from "./cart-provider";
import type { Painting, Series } from "@/lib/types";

type Filter = "all" | Series;

type Props = { paintings: Painting[]; initialSeries?: Filter };

export default function Gallery({ paintings, initialSeries = "all" }: Props) {
  const filter = initialSeries;
  const { openDetail } = useCart();

  const visible =
    filter === "all" ? paintings : paintings.filter((p) => p.series === filter);

  return (
    <section>
      <div className="gallery-wrap">
        <div className="gallery-grid">
          {visible.map((p, i) => (
            <GalleryCard key={p.id} painting={p} index={i} onOpen={() => openDetail(p)} />
          ))}
        </div>
      </div>
    </section>
  );
}

function GalleryCard({
  painting,
  onOpen,
  index,
}: {
  painting: Painting;
  onOpen: () => void;
  index: number;
}) {
  const [hover, setHover] = useState(false);
  const sold = painting.status === "sold";

  return (
    <div
      className="gallery-card"
      style={{
        breakInside: "avoid",
        marginBottom: 64,
      }}
    >
      <Link
        href={`/paintings/${painting.slug}`}
        onClick={(e) => {
          // Intercept for in-page panel overlay; still deep-linkable via URL.
          e.preventDefault();
          onOpen();
          history.pushState(null, "", `/paintings/${painting.slug}`);
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ display: "block", width: "100%", textAlign: "left" }}
      >
        <div
          style={{
            position: "relative",
            transition: "transform .6s cubic-bezier(.2,.6,.2,1)",
            transform: hover ? "translateY(-3px)" : "translateY(0)",
          }}
        >
          <PaintingImage painting={painting} priority={index < 3} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to top, rgba(28,25,21,0.28), rgba(28,25,21,0) 55%)",
              opacity: hover ? 1 : 0,
              transition: "opacity .3s",
              display: "flex",
              alignItems: "flex-end",
              padding: 16,
            }}
          >
            <span className="small-caps" style={{ color: "var(--paper)", fontSize: 10 }}>
              View painting →
            </span>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "baseline",
            gap: 16,
            marginTop: 20,
          }}
        >
          <div>
            <div
              className="serif italic"
              style={{ fontSize: 19, lineHeight: 1.25, fontWeight: 400 }}
            >
              {painting.title}
            </div>
            <div
              className="muted"
              style={{ fontSize: 12, marginTop: 4, letterSpacing: "0.01em" }}
            >
              {painting.medium}, {painting.w}″ × {painting.h}″ · {painting.year}
            </div>
          </div>
          <div
            className="serif"
            style={{
              fontSize: 16,
              color: sold ? "var(--ink-4)" : "var(--ink)",
              textDecoration: sold ? "line-through" : "none",
            }}
          >
            ${painting.price}
          </div>
        </div>
      </Link>
    </div>
  );
}
