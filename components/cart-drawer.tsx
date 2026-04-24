"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "./cart-provider";
import PaintingImage from "./painting-image";
import { IconClose } from "./icons";

export default function CartDrawer() {
  const router = useRouter();
  const { cart, cartOpen, closeCart, removeFromCart } = useCart();

  useEffect(() => {
    if (cartOpen) {
      document.body.style.overflow = "hidden";
      const h = (e: KeyboardEvent) => {
        if (e.key === "Escape") closeCart();
      };
      window.addEventListener("keydown", h);
      return () => {
        window.removeEventListener("keydown", h);
        document.body.style.overflow = "";
      };
    }
  }, [cartOpen, closeCart]);

  const subtotal = cart.reduce((a, p) => a + p.price, 0);
  const total = subtotal;

  const handleCheckout = () => {
    closeCart();
    router.push("/checkout");
  };

  return (
    <>
      <div
        onClick={closeCart}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "rgba(28,25,21,0.4)",
          opacity: cartOpen ? 1 : 0,
          pointerEvents: cartOpen ? "auto" : "none",
          transition: "opacity .3s",
        }}
      />

      <aside
        aria-label="Cart"
        aria-hidden={!cartOpen}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 41,
          width: "min(460px, 100%)",
          background: "var(--paper)",
          transform: cartOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform .45s cubic-bezier(.2,.7,.2,1)",
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid var(--line-2)",
        }}
      >
        <div
          style={{
            padding: "24px 32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--line-2)",
          }}
        >
          <div>
            <div className="serif" style={{ fontSize: 22, fontWeight: 400 }}>
              Your cart
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {cart.length === 0
                ? "No works yet"
                : `${cart.length} ${cart.length === 1 ? "painting" : "paintings"}`}
            </div>
          </div>
          <button onClick={closeCart} style={{ color: "var(--ink-3)" }} aria-label="Close cart">
            <IconClose size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 32px" }}>
          {cart.length === 0 ? (
            <div style={{ padding: "80px 0", textAlign: "center" }}>
              <div className="serif italic muted" style={{ fontSize: 19, marginBottom: 10 }}>
                Your cart is empty.
              </div>
              <div
                className="muted"
                style={{ fontSize: 13, maxWidth: 260, margin: "0 auto", lineHeight: 1.6 }}
              >
                Browse the catalog and add a painting to begin.
              </div>
              <button
                onClick={closeCart}
                className="small-caps"
                style={{
                  marginTop: 28,
                  padding: "14px 26px",
                  border: "1px solid var(--ink)",
                  fontSize: 11,
                  letterSpacing: "0.22em",
                }}
              >
                View paintings
              </button>
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {cart.map((p, idx) => (
                <li
                  key={p.id + idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "84px 1fr auto",
                    gap: 18,
                    padding: "24px 0",
                    borderBottom: "1px solid var(--line-2)",
                  }}
                >
                  <div style={{ width: 84 }}>
                    <PaintingImage painting={p} />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div className="serif italic" style={{ fontSize: 16, lineHeight: 1.25 }}>
                        {p.title}
                      </div>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                        {[`${p.w}″ × ${p.h}″`, p.year > 0 ? String(p.year) : null].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(idx)}
                      className="small-caps muted"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.18em",
                        alignSelf: "flex-start",
                        marginTop: 12,
                        textDecoration: "underline",
                        textUnderlineOffset: 3,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="serif" style={{ fontSize: 15 }}>
                    ${p.price}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cart.length > 0 && (
          <div
            style={{
              padding: "20px 32px 28px",
              borderTop: "1px solid var(--line-2)",
              background: "var(--paper-2)",
            }}
          >
            <Row label="Subtotal" value={`$${subtotal}`} />
            <Row label="Delivery" value="Free" />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "14px 0 18px",
                marginTop: 6,
                borderTop: "1px solid var(--line)",
                alignItems: "baseline",
              }}
            >
              <span className="small-caps" style={{ fontSize: 11 }}>Total</span>
              <span className="serif" style={{ fontSize: 22 }}>${total}</span>
            </div>
            <button
              onClick={handleCheckout}
              className="small-caps"
              style={{
                width: "100%",
                padding: "16px",
                background: "var(--ink)",
                color: "var(--paper)",
                fontSize: 11,
                letterSpacing: "0.22em",
              }}
            >
              Proceed to checkout
            </button>
            <div
              className="muted"
              style={{
                fontSize: 10.5,
                textAlign: "center",
                marginTop: 12,
                letterSpacing: "0.05em",
              }}
            >
              Free delivery. Returns accepted within 14 days.
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 0",
        fontSize: 13,
      }}
    >
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
