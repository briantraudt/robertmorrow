"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/components/cart-provider";

// useSearchParams requires a Suspense boundary when a page is statically
// generated. Wrap the real content in <Suspense> and export a tiny shell.
export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<SuccessShell />}>
      <SuccessInner />
    </Suspense>
  );
}

function SuccessInner() {
  const params = useSearchParams();
  const orderRef = params.get("payment_intent") ?? params.get("session_id");
  const { clearCart } = useCart();

  // Clear the cart on a successful Stripe return.
  useEffect(() => {
    clearCart();
  }, [clearCart]);

  return <SuccessShell orderRef={orderRef ?? undefined} />;
}

function SuccessShell({ orderRef }: { orderRef?: string }) {
  return (
    <section
      style={{
        maxWidth: 780,
        margin: "0 auto",
        padding: "120px 48px 160px",
        textAlign: "center",
      }}
    >
      <div className="micro muted" style={{ marginBottom: 24 }}>Order placed</div>
      <h1
        className="serif italic"
        style={{
          fontSize: "clamp(44px, 6vw, 64px)",
          fontWeight: 400,
          letterSpacing: "-0.01em",
          lineHeight: 1.05,
        }}
      >
        Thank you.
      </h1>
      <p
        className="muted"
        style={{
          maxWidth: 480,
          margin: "28px auto 0",
          fontSize: 15,
          lineHeight: 1.7,
        }}
      >
        A confirmation has been sent to your email. Robert will contact you
        shortly to discuss delivery options.
      </p>
      {orderRef && (
        <div
          className="small-caps muted"
          style={{ marginTop: 36, fontSize: 10.5, letterSpacing: "0.2em" }}
        >
          Order reference · {orderRef.slice(-10).toUpperCase()}
        </div>
      )}
      <Link
        href="/"
        className="small-caps"
        style={{
          display: "inline-block",
          marginTop: 48,
          padding: "14px 26px",
          border: "1px solid var(--ink)",
          fontSize: 11,
          letterSpacing: "0.22em",
        }}
      >
        Return to paintings
      </Link>
    </section>
  );
}
