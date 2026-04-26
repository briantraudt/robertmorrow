"use client";

// =======================================================================
// Visual three-step checkout with Stripe's Payment Element embedded on-site.
// =======================================================================

import { useState } from "react";
import Link from "next/link";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import PaintingImage from "./painting-image";
import { IconArrowLeft, IconCheck } from "./icons";
import { useCart } from "./cart-provider";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

export default function CheckoutFlow() {
  const { cart, clearCart } = useCart();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    name: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
  });
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const subtotal = cart.reduce((a, p) => a + p.price, 0);
  const delivery = 0;
  const total = subtotal + delivery;

  const empty = cart.length === 0 && step !== 4;

  async function preparePaymentStep() {
    setError(null);
    setSubmitting(true);
    try {
      if (!stripePromise) {
        throw new Error("Stripe is not configured yet.");
      }
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: cart.map((p) => ({ id: p.id, slug: p.slug })),
          email: form.email,
          name: form.name,
          address: {
            line1: form.address1,
            line2: form.address2,
            city: form.city,
            state: form.state,
            postal_code: form.zip,
            country: "US",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error || "Checkout failed. Please try again.");
      }
      setClientSecret(data.clientSecret as string);
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Checkout failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (empty) {
    return (
      <div
        style={{
          maxWidth: 700,
          margin: "0 auto",
          padding: "96px 48px 120px",
          textAlign: "center",
        }}
      >
        <div className="serif italic muted" style={{ fontSize: 28, marginBottom: 16 }}>
          Your cart is empty.
        </div>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.7 }}>
          Browse the catalog and add a painting to begin checkout.
        </p>
        <Link
          href="/"
          className="small-caps"
          style={{
            display: "inline-block",
            marginTop: 28,
            padding: "14px 26px",
            border: "1px solid var(--ink)",
            fontSize: 11,
            letterSpacing: "0.22em",
          }}
        >
          View paintings
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "56px 48px 120px" }}>
      <Link
        href="/"
        className="small-caps"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 11,
          color: "var(--ink-3)",
        }}
      >
        <IconArrowLeft size={14} sw={1.3} /> Back to paintings
      </Link>

      <div
        className="checkout-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 80,
          marginTop: 32,
        }}
      >
        <div>
          <h1
            className="serif"
            style={{
              fontSize: 48,
              fontWeight: 400,
              lineHeight: 1.05,
              letterSpacing: "-0.01em",
              marginBottom: 8,
            }}
          >
            Checkout.
          </h1>
          <p className="muted" style={{ fontSize: 14, marginBottom: 40 }}>
            Three short steps. No account required.
          </p>

          <div style={{ display: "flex", gap: 0, marginBottom: 40 }}>
            {[
              { n: 1, label: "Contact" },
              { n: 2, label: "Delivery" },
              { n: 3, label: "Payment" },
            ].map((s, i) => (
              <div
                key={s.n}
                style={{ flex: 1, display: "flex", alignItems: "center" }}
              >
                <button
                  onClick={() => step > s.n && setStep(s.n as 1 | 2 | 3)}
                  className="small-caps"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 10.5,
                    letterSpacing: "0.2em",
                    color: step >= s.n ? "var(--ink)" : "var(--ink-4)",
                    cursor: step > s.n ? "pointer" : "default",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      border: `1px solid ${step >= s.n ? "var(--ink)" : "var(--line)"}`,
                      background: step > s.n ? "var(--ink)" : "transparent",
                      color: step > s.n ? "var(--paper)" : "inherit",
                      fontSize: 10,
                      letterSpacing: 0,
                    }}
                  >
                    {step > s.n ? <IconCheck size={11} sw={1.8} /> : s.n}
                  </span>
                  {s.label}
                </button>
                {i < 2 && (
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: "var(--line)",
                      margin: "0 16px",
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {step === 1 && (
            <StepCard title="Contact information">
              <Field
                label="Email"
                value={form.email}
                onChange={(v) => set("email", v)}
                placeholder="you@example.com"
                type="email"
              />
              <Field
                label="Full name"
                value={form.name}
                onChange={(v) => set("name", v)}
                placeholder="First and last name"
              />
              <Next
                onNext={() => setStep(2)}
                disabled={!form.email || !form.name}
                label="Continue to delivery"
              />
            </StepCard>
          )}

          {step === 2 && (
            <StepCard title="Delivery address">
              <Field
                label="Address"
                value={form.address1}
                onChange={(v) => set("address1", v)}
                placeholder="Street"
              />
              <Field
                label="Apt / Suite (optional)"
                value={form.address2}
                onChange={(v) => set("address2", v)}
              />
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 16 }}>
                <Field label="City" value={form.city} onChange={(v) => set("city", v)} />
                <Field label="State" value={form.state} onChange={(v) => set("state", v)} />
                <Field label="ZIP" value={form.zip} onChange={(v) => set("zip", v)} />
              </div>
              <Next
                onNext={preparePaymentStep}
                disabled={
                  submitting ||
                  !form.address1 ||
                  !form.city ||
                  !form.state ||
                  !form.zip
                }
                label={submitting ? "Preparing payment..." : "Continue to payment"}
              />
            </StepCard>
          )}

          {step === 3 && (
            <StepCard title="Payment">
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                Secure card entry is handled by Stripe here on Robert&apos;s
                site. You won&apos;t be sent to a separate checkout page unless
                your bank requires an extra verification step.
              </p>
              {error && (
                <div
                  role="alert"
                  style={{
                    background: "var(--paper-2)",
                    padding: "12px 16px",
                    fontSize: 13,
                    color: "var(--ink-2)",
                    borderLeft: "2px solid var(--ink)",
                  }}
                >
                  {error}
                </div>
              )}
              {clientSecret && stripePromise ? (
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: {
                      theme: "stripe",
                      variables: {
                        colorPrimary: "#1C1915",
                        colorText: "#1C1915",
                        colorTextSecondary: "#6B6557",
                        colorBackground: "#FCFAF6",
                        colorDanger: "#A42F2F",
                        fontFamily:
                          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                        borderRadius: "0px",
                        spacingUnit: "4px",
                      },
                      rules: {
                        ".Input": {
                          border: "1px solid #ded8ce",
                          boxShadow: "none",
                        },
                        ".Input:focus": {
                          border: "1px solid #1C1915",
                          boxShadow: "none",
                        },
                        ".Label": {
                          color: "#6B6557",
                          fontSize: "11px",
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                        },
                        ".Tab": {
                          border: "1px solid #ded8ce",
                          boxShadow: "none",
                        },
                        ".Tab--selected": {
                          borderColor: "#1C1915",
                          boxShadow: "none",
                        },
                      },
                    },
                  }}
                >
                  <EmbeddedPayment
                    total={total}
                    clearCart={clearCart}
                    setError={setError}
                  />
                </Elements>
              ) : (
                <Next
                  onNext={preparePaymentStep}
                  disabled={submitting}
                  label={submitting ? "Preparing payment..." : "Load payment form"}
                />
              )}
            </StepCard>
          )}
        </div>

        <aside>
          <div
            style={{
              border: "1px solid var(--line)",
              padding: "28px 28px 24px",
              background: "var(--paper-2)",
              position: "sticky",
              top: 100,
            }}
          >
            <div className="small-caps" style={{ fontSize: 11, marginBottom: 20 }}>
              Order summary
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {cart.map((p, i) => (
                <li
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "56px 1fr auto",
                    gap: 14,
                  }}
                >
                  <div style={{ width: 56 }}>
                    <PaintingImage painting={p} />
                  </div>
                  <div>
                    <div
                      className="serif italic"
                      style={{ fontSize: 14, lineHeight: 1.3 }}
                    >
                      {p.title}
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                      {p.w}″ × {p.h}″
                    </div>
                  </div>
                  <div className="serif" style={{ fontSize: 13 }}>${p.price}</div>
                </li>
              ))}
            </ul>
            <hr className="hairline" style={{ margin: "20px 0 16px" }} />
            <Row label="Subtotal" value={`$${subtotal}`} />
            <Row label="Delivery" value="Free" />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "14px 0 0",
                marginTop: 10,
                borderTop: "1px solid var(--line)",
                alignItems: "baseline",
              }}
            >
              <span className="small-caps" style={{ fontSize: 11 }}>Total</span>
              <span className="serif" style={{ fontSize: 22 }}>${total}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EmbeddedPayment({
  total,
  clearCart,
  setError,
}: {
  total: number;
  clearCart: () => void;
  setError: (message: string | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setError(null);
    setPaying(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success`,
      },
      redirect: "if_required",
    });

    if (error) {
      setError(error.message ?? "Payment failed. Please try again.");
      setPaying(false);
      return;
    }

    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      clearCart();
      window.location.href = `/checkout/success?payment_intent=${paymentIntent.id}`;
      return;
    }

    setError("Payment could not be completed. Please try again.");
    setPaying(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          border: "1px solid var(--line)",
          padding: 18,
          background: "var(--paper-2)",
        }}
      >
        <PaymentElement />
      </div>
      <button
        type="submit"
        disabled={!stripe || !elements || paying}
        className="small-caps"
        style={{
          marginTop: 12,
          padding: "16px 24px",
          background: !stripe || !elements || paying ? "var(--paper-3)" : "var(--ink)",
          color: !stripe || !elements || paying ? "var(--ink-3)" : "var(--paper)",
          fontSize: 11,
          letterSpacing: "0.22em",
          cursor: !stripe || !elements || paying ? "not-allowed" : "pointer",
        }}
      >
        {paying ? "Processing..." : `Pay securely · $${total}`}
      </button>
    </form>
  );
}

function StepCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        padding: "32px 36px",
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div
        className="serif"
        style={{ fontSize: 22, fontWeight: 400, marginBottom: 4 }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="small-caps muted" style={{ fontSize: 10 }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          fontSize: 14,
          padding: "12px 2px",
          borderBottom: "1px solid var(--line)",
        }}
        onFocus={(e) => (e.target.style.borderBottomColor = "var(--ink)")}
        onBlur={(e) => (e.target.style.borderBottomColor = "var(--line)")}
      />
    </label>
  );
}

function Next({
  onNext,
  disabled,
  label,
}: {
  onNext: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onNext}
      disabled={disabled}
      className="small-caps"
      style={{
        marginTop: 12,
        padding: "16px 24px",
        background: disabled ? "var(--paper-3)" : "var(--ink)",
        color: disabled ? "var(--ink-3)" : "var(--paper)",
        fontSize: 11,
        letterSpacing: "0.22em",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
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
