"use client";

import { useCart } from "./cart-provider";
import { IconCheck } from "./icons";

export default function Toast() {
  const { toast, openCart } = useCart();
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        background: "var(--ink)",
        color: "var(--paper)",
        padding: "14px 24px",
        fontSize: 12,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        animation: "rm-toast-in .3s ease",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          background: "var(--paper)",
          color: "var(--ink)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IconCheck size={11} sw={2} />
      </span>
      <span>“{toast}” added</span>
      <button
        onClick={openCart}
        style={{
          textDecoration: "underline",
          textUnderlineOffset: 3,
          color: "var(--paper)",
        }}
      >
        View cart
      </button>
    </div>
  );
}
