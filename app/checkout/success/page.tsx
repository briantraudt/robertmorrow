"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/components/cart-provider";
import {
  checkoutRequest,
  clearCheckoutDraft,
  reservationIdPattern,
  type CheckoutStatus,
} from "@/components/checkout-session";

type VerificationState = CheckoutStatus["status"] | "checking" | "missing" | "error";

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<SuccessShell status="checking" />}>
      <SuccessInner />
    </Suspense>
  );
}

function SuccessInner() {
  const params = useSearchParams();
  const reservationId = params.get("reservation_id");
  const sessionId = params.get("session_id");
  const { removePurchased } = useCart();
  const [status, setStatus] = useState<VerificationState>("checking");
  const [orderRef, setOrderRef] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const reference = reservationId && reservationIdPattern.test(reservationId)
      ? { reservationId }
      : sessionId && /^cs_(?:test_|live_)?[a-zA-Z0-9]+$/.test(sessionId)
        ? { sessionId }
        : null;
    if (!reference) {
      setStatus("missing");
      setChecking(false);
      return;
    }

    let stopped = false;
    let attempts = 0;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const deadline = Date.now() + 45_000;
    const deadlineTimer = setTimeout(() => {
      if (stopped) return;
      controller.abort();
      setChecking(false);
    }, 45_000);
    setStatus("checking");
    setChecking(true);
    setOrderRef(undefined);

    async function verify() {
      attempts += 1;
      try {
        const result = await checkoutRequest<CheckoutStatus>("/api/checkout/status", reference, controller.signal);
        if (stopped) return;
        if (!["paid", "processing", "pending", "released"].includes(result.status)) {
          throw new Error("Invalid payment status.");
        }
        failures = 0;
        setStatus(result.status);
        if (result.status === "paid") {
          if (Array.isArray(result.paintingIds)) {
            removePurchased(result.paintingIds.filter((id) => typeof id === "string"));
          }
          if (reference && "reservationId" in reference && reference.reservationId) {
            clearCheckoutDraft(reference.reservationId);
          }
          if (typeof result.orderRef === "string") setOrderRef(result.orderRef);
          setChecking(false);
          clearTimeout(deadlineTimer);
          return;
        }
        if (result.status === "released") {
          if (reference && "reservationId" in reference && reference.reservationId) {
            clearCheckoutDraft(reference.reservationId);
          }
          setChecking(false);
          clearTimeout(deadlineTimer);
          return;
        }
      } catch {
        if (stopped) return;
        failures += 1;
        if (failures >= 3 || controller.signal.aborted) {
          setStatus("error");
          setChecking(false);
          clearTimeout(deadlineTimer);
          return;
        }
      }
      if (attempts < 10 && Date.now() < deadline && !controller.signal.aborted) {
        timer = setTimeout(() => void verify(), 2_000);
      } else {
        setChecking(false);
        setStatus((current) => current === "checking" ? "error" : current);
        clearTimeout(deadlineTimer);
      }
    }

    void verify();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      clearTimeout(deadlineTimer);
    };
  }, [reservationId, sessionId, removePurchased, retry]);

  return <SuccessShell status={status} orderRef={orderRef} checking={checking} onRetry={() => setRetry((current) => current + 1)} />;
}

function SuccessShell({ status, orderRef, checking = false, onRetry }: {
  status: VerificationState;
  orderRef?: string;
  checking?: boolean;
  onRetry?: () => void;
}) {
  const copy: Record<VerificationState, { label: string; title: string; message: string }> = {
    checking: {
      label: "Checking payment",
      title: "One moment.",
      message: "We’re confirming your payment and your painting’s availability. Please keep this page open.",
    },
    paid: {
      label: "Payment received",
      title: "Thank you.",
      message: "Your payment is confirmed. Robert will contact you to arrange delivery",
    },
    processing: {
      label: "Payment processing",
      title: "We’re waiting for your bank.",
      message: "Your payment is still processing. Check its status here before making another payment.",
    },
    pending: {
      label: "Payment not confirmed",
      title: "Your checkout is waiting.",
      message: "Payment has not completed. You can return to checkout to finish paying, or check again if you just completed bank verification.",
    },
    released: {
      label: "Checkout ended",
      title: "Your reservation has ended.",
      message: "This checkout was cancelled or expired. Return to checkout to check which paintings are still available.",
    },
    missing: {
      label: "Payment not verified",
      title: "We need your checkout link.",
      message: "This page doesn’t contain a valid checkout reference, so we can’t confirm a purchase. Return to checkout or open your payment link.",
    },
    error: {
      label: "Confirmation unavailable",
      title: "We couldn’t confirm it yet.",
      message: "We couldn’t verify your payment’s status. Please check again before trying another payment. Your cart has been kept.",
    },
  };
  const content = copy[status];
  const canRetry = status === "processing" || status === "pending" || status === "error";

  return (
    <section
      style={{
        maxWidth: 780,
        margin: "0 auto",
        padding: "120px 48px 160px",
        textAlign: "center",
      }}
    >
      <div className="micro muted" style={{ marginBottom: 24 }}>{content.label}</div>
      <h1
        className="serif italic"
        style={{
          fontSize: "clamp(44px, 6vw, 64px)",
          fontWeight: 400,
          letterSpacing: "-0.01em",
          lineHeight: 1.05,
        }}
      >
        {content.title}
      </h1>
      <p
        role="status"
        aria-live="polite"
        className="muted"
        style={{
          maxWidth: 480,
          margin: "28px auto 0",
          fontSize: 15,
          lineHeight: 1.7,
        }}
      >
        {content.message}
      </p>
      {orderRef && status === "paid" && (
        <div
          className="small-caps muted"
          style={{ marginTop: 36, fontSize: 10.5, letterSpacing: "0.2em" }}
        >
          Order reference · {orderRef.slice(-12).toUpperCase()}
        </div>
      )}
      {canRetry && onRetry && (
        <button type="button" onClick={onRetry} disabled={checking} className="small-caps" style={{ display: "block", margin: "32px auto 0", padding: "14px 26px", background: "var(--ink)", color: "var(--paper)", fontSize: 11, letterSpacing: "0.22em" }}>
          {checking ? "Checking…" : "Check payment status"}
        </button>
      )}
      {status !== "checking" && status !== "paid" && status !== "processing" && status !== "error" && (
        <Link href="/checkout" className="small-caps" style={{ display: "inline-block", marginTop: 32, padding: "14px 26px", border: "1px solid var(--ink)", fontSize: 11, letterSpacing: "0.22em" }}>
          Return to checkout
        </Link>
      )}
      <Link
        href="/"
        className="small-caps"
        style={{
          display: "block",
          width: "fit-content",
          margin: "32px auto 0",
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
