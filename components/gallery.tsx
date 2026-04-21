"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PaintingImage from "./painting-image";
import { useCart } from "./cart-provider";
import type { Painting, Series } from "@/lib/types";

type Filter = "all" | Series;
type Sort = "curated" | "newest" | "price-asc" | "price-desc";

type Props = { paintings: Painting[]; initialSeries?: Filter };

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "curated",    label: "Curated" },
  { value: "newest",     label: "Newest first" },
  { value: "price-asc",  label: "Price, low to high" },
  { value: "price-desc", label: "Price, high to low" },
];

export default function Gallery({ paintings, initialSeries = "all" }: Props) {
  const [filter] = useState<Filter>(initialSeries);
  const [sort, setSort] = useState<Sort>("curated");
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement | null>(null);
  const { openDetail } = useCart();

  const visible = useMemo(() => {
    let list = paintings.filter((p) => (filter === "all" ? true : p.series === filter));
    if (sort === "price-asc") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "price-desc") list = [...list].sort((a, b) => b.price - a.price);
    if (sort === "newest") list = [...list].sort((a, b) => b.year - a.year);
    return list;
  }, [paintings, filter, sort]);

  // Close sort menu on outside click / Esc
  useEffect(() => {
    if (!sortOpen) return;
    const onDown = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSortOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [sortOpen]);

  return (
    <section>
      <div className="gallery-controls">
        <div className="gallery-controls-inner">
          <div ref={sortRef} style={{ position: "relative" }}>
            <button
              onClick={() => setSortOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              className="small-caps"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                letterSpacing: "0.22em",
                color: "var(--ink)",
              }}
            >
              Sort
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {sortOpen && (
              <div
                role="listbox"
                style={{
                  position: "absolute",
                  top: "calc(100% + 12px)",
                  right: 0,
                  minWidth: 200,
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                  padding: "6px 0",
                  zIndex: 10,
                  boxShadow: "0 12px 32px rgba(28,25,21,0.08)",
                }}
              >
                {SORT_OPTIONS.map((opt) => {
                  const selected = sort === opt.value;
                  return (
                    <button
                      key={opt.value}
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setSort(opt.value);
                        setSortOpen(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 18px",
                        fontSize: 13,
                        color: selected ? "var(--ink)" : "var(--ink-3)",
                        background: "transparent",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
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
