"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "./cart-provider";
import PaintingImage from "./painting-image";
import MakeOffer from "./make-offer";
import { IconArrowLeft } from "./icons";
import type { Painting } from "@/lib/types";

type Props = {
  // When rendered from /paintings/[slug], the painting comes from the server.
  // When rendered as the overlay from the gallery, it comes from cart context.
  painting?: Painting;
  onClose?: () => void;
};

export default function Detail({ painting, onClose }: Props) {
  const router = useRouter();
  const { detail, closeDetail, addToCart, isInCart } = useCart();
  const p = painting ?? detail;
  const handleClose =
    onClose ??
    (() => {
      closeDetail();
      // Drop the painting slug from the URL if we pushed it.
      if (typeof window !== "undefined" && window.location.pathname.startsWith("/paintings/")) {
        router.back();
      }
    });

  useEffect(() => {
    if (!p) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [p, handleClose]);

  if (!p) return null;
  const sold = p.status === "sold";
  const hasPrice = p.price > 0;
  const hasYear = p.year > 0;
  const inCart = isInCart(p.id);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(28, 25, 21, 0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "flex-end",
        animation: "rm-fade-in .3s ease",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={hasYear ? `${p.title}, ${p.year}` : p.title}
    >
      <div
        style={{
          background: "var(--paper)",
          width: "min(1180px, 100%)",
          maxWidth: "100%",
          overflowY: "auto",
          animation: "rm-slide-in .45s cubic-bezier(.2,.7,.2,1)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "22px 40px",
            borderBottom: "1px solid var(--line-2)",
            position: "sticky",
            top: 0,
            background: "rgba(252,250,246,0.95)",
            backdropFilter: "blur(10px)",
            zIndex: 1,
          }}
        >
          <button
            onClick={handleClose}
            className="small-caps"
            style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11 }}
          >
            <IconArrowLeft size={14} sw={1.3} /> Back to paintings
          </button>
        </div>

        <div
          className="detail-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1.25fr 1fr",
            gap: 0,
            minHeight: "calc(100vh - 65px)",
          }}
        >
          <div
            style={{
              padding: "80px 60px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--paper-2)",
            }}
          >
            <div style={{ width: "100%", maxWidth: 560 }}>
              <PaintingImage painting={p} priority useGalleryThumb />
              <div
                className="muted"
                style={{
                  textAlign: "center",
                  marginTop: 20,
                  fontSize: 11,
                  letterSpacing: "0.08em",
                }}
              >
                {p.w}″ × {p.h}″ · actual size varies on screen
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "80px 56px",
              display: "flex",
              flexDirection: "column",
              gap: 40,
            }}
          >
            <div>
              <h1
                className="serif"
                style={{
                  fontSize: 44,
                  fontWeight: 400,
                  lineHeight: 1.05,
                  letterSpacing: "-0.01em",
                }}
              >
                <span className="italic">{p.title}</span>
              </h1>
              <div className="muted" style={{ marginTop: 12, fontSize: 14 }}>
                Robert Morrow{hasYear ? `, ${p.year}` : ""}
              </div>
            </div>

            <div
              className="serif"
              style={{
                fontSize: 28,
                fontWeight: 400,
                color: sold ? "var(--ink-4)" : "var(--ink)",
                textDecoration: sold ? "line-through" : "none",
              }}
            >
              {hasPrice ? `$${p.price}` : "Price on request"}
            </div>

            <hr className="hairline" />

            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "14px 40px",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              <dt className="small-caps muted" style={{ fontSize: 10 }}>Medium</dt>
              <dd>{p.medium}</dd>
              <dt className="small-caps muted" style={{ fontSize: 10 }}>Dimensions</dt>
              <dd>
                {p.w}″ × {p.h}″ ({Math.round(p.w * 2.54)} × {Math.round(p.h * 2.54)} cm)
              </dd>
              {hasYear && (
                <>
                  <dt className="small-caps muted" style={{ fontSize: 10 }}>Year</dt>
                  <dd>{p.year}</dd>
                </>
              )}
              <dt className="small-caps muted" style={{ fontSize: 10 }}>Framing</dt>
              <dd>{p.framing || "Unframed; shipped flat"}</dd>
              <dt className="small-caps muted" style={{ fontSize: 10 }}>Delivery</dt>
              <dd>Free local delivery. Shipping available upon request.</dd>
            </dl>

            {p.note && (
              <>
                <hr className="hairline" />
                <blockquote
                  className="serif italic muted"
                  style={{
                    fontSize: 18,
                    lineHeight: 1.5,
                    borderLeft: "1px solid var(--line)",
                    paddingLeft: 20,
                  }}
                >
                  “{p.note}”
                </blockquote>
              </>
            )}

            <div
              style={{
                marginTop: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <button
                disabled={sold || !hasPrice}
                onClick={() => !sold && hasPrice && addToCart(p)}
                className="small-caps"
                style={{
                  width: "100%",
                  padding: "18px 24px",
                  background: sold || !hasPrice ? "var(--paper-3)" : "var(--ink)",
                  color: sold || !hasPrice ? "var(--ink-3)" : "var(--paper)",
                  fontSize: 11,
                  letterSpacing: "0.22em",
                  cursor: sold || !hasPrice ? "not-allowed" : "pointer",
                  transition: "background .2s",
                }}
              >
                {sold
                  ? "This work has sold"
                  : !hasPrice
                    ? "Price to be added"
                  : inCart
                    ? "Added to cart ✓"
                    : `Add to cart · $${p.price}`}
              </button>
              {!sold && <MakeOffer painting={p} />}
              <div className="muted" style={{ fontSize: 11.5, textAlign: "center" }}>
                Questions?{" "}
                <a
                  href="/contact"
                  style={{ textDecoration: "underline", textUnderlineOffset: 3 }}
                >
                  Write to Robert
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
