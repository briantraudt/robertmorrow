"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import PaintingImage from "./painting-image";
import { useCart } from "./cart-provider";
import type { Painting, Series } from "@/lib/types";

type Filter = "all" | Series;
type Sort = "curated" | "newest" | "price-asc" | "price-desc";

type Props = { paintings: Painting[]; initialSeries?: Filter };

export default function Gallery({ paintings, initialSeries = "all" }: Props) {
  const [filter, setFilter] = useState<Filter>(initialSeries);
  const [sort, setSort] = useState<Sort>("curated");
  const { openDetail } = useCart();

  const visible = useMemo(() => {
    let list = paintings.filter((p) => (filter === "all" ? true : p.series === filter));
    if (sort === "price-asc") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "price-desc") list = [...list].sort((a, b) => b.price - a.price);
    if (sort === "newest") list = [...list].sort((a, b) => b.year - a.year);
    return list;
  }, [paintings, filter, sort]);

  const counts = {
    all: paintings.length,
    abstract: paintings.filter((p) => p.series === "abstract").length,
    nature: paintings.filter((p) => p.series === "nature").length,
  };

  return (
    <section>
      <div className="gallery-controls">
        <div className="gallery-controls-inner">
          <div className="gallery-filters">
            {(
              [
                ["all", "All", counts.all],
                ["abstract", "Abstract", counts.abstract],
                ["nature", "Nature", counts.nature],
              ] as const
            ).map(([k, label, n]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className="small-caps"
                style={{
                  color: filter === k ? "var(--ink)" : "var(--ink-3)",
                  fontSize: 11,
                  letterSpacing: "0.2em",
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  transition: "color .2s",
                  borderBottom:
                    filter === k ? "1px solid var(--ink)" : "1px solid transparent",
                  paddingBottom: 3,
                }}
              >
                {label}
                <span style={{ fontSize: 9, opacity: 0.6 }}>{n}</span>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              className="small-caps muted"
              style={{ fontSize: 10, letterSpacing: "0.2em" }}
            >
              Sort
            </span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              style={{
                fontFamily: "var(--body)",
                fontSize: 12,
                background: "transparent",
                border: "none",
                color: "var(--ink)",
                outline: "none",
                cursor: "pointer",
                letterSpacing: "0.05em",
                appearance: "none",
                WebkitAppearance: "none",
                paddingRight: 16,
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B6557' stroke-width='1.5'><path d='M6 9l6 6 6-6'/></svg>\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right center",
              }}
            >
              <option value="curated">Curated</option>
              <option value="newest">Newest first</option>
              <option value="price-asc">Price, low to high</option>
              <option value="price-desc">Price, high to low</option>
            </select>
          </div>
        </div>
      </div>

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
