"use client";

// =======================================================================
// Visual three-step checkout with Stripe's Payment Element embedded on-site.
// =======================================================================

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import PaintingImage from "./painting-image";
import { IconArrowLeft, IconCheck } from "./icons";
import { useCart } from "./cart-provider";
import {
  checkoutFingerprint,
  checkoutRequest,
  clearCheckoutDraft,
  emptyCheckoutForm,
  readCheckoutDraft,
  saveCheckoutDraft,
  type CheckoutDraft,
  type CheckoutForm,
  type CheckoutStatus,
} from "./checkout-session";
import type { Painting } from "@/lib/types";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

export default function CheckoutFlow() {
  const router = useRouter();
  const { cart, hydrated: cartHydrated } = useCart();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [form, setForm] = useState<CheckoutForm>(emptyCheckoutForm);
  const [draft, setDraft] = useState<CheckoutDraft | null>(null);
  const [expired, setExpired] = useState(false);
  const draftRef = useRef<CheckoutDraft | null>(null);
  const operationRef = useRef(false);
  const resumedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const saved = readCheckoutDraft();
    if (saved) {
      draftRef.current = saved;
      setDraft(saved);
      setForm(saved.form);
      setStep(3);
    }
    setHydrated(true);
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!hydrated || !cartHydrated || resumedRef.current || !draftRef.current) return;
    resumedRef.current = true;
    void preparePaymentStep(draftRef.current);
    // Resume exactly the saved request; changing cart/form must never create
    // a second PaymentIntent while an earlier request is uncertain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, cartHydrated]);

  useEffect(() => {
    if (!draft?.expiresAt) return;
    const remaining = new Date(draft.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(remaining)) return;
    if (remaining <= 0) { setExpired(true); return; }
    setExpired(false);
    const timer = setTimeout(() => setExpired(true), Math.min(remaining, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [draft?.expiresAt]);

  const set = (key: keyof CheckoutForm, value: string) => {
    if (!draftRef.current && !operationRef.current && !submitting && !paying) {
      setForm((current) => ({ ...current, [key]: value }));
    }
  };

  const summaryItems = draft?.summary ?? cart;
  const subtotal = summaryItems.reduce((sum, painting) => sum + painting.price, 0);
  const total = draft?.total ?? subtotal;
  const cartChanged = cartHydrated && Boolean(draft) &&
    JSON.stringify(cart.map((painting) => painting.id).sort()) !==
    JSON.stringify(draft!.items.map((item) => item.id).sort());
  const busy = submitting || paying;
  const empty = hydrated && cartHydrated && cart.length === 0 && !draft;

  function remember(next: CheckoutDraft) {
    saveCheckoutDraft(next);
    draftRef.current = next;
    setDraft(next);
  }

  function forget(reservationId: string) {
    clearCheckoutDraft(reservationId);
    draftRef.current = null;
    setDraft(null);
    setClientSecret(null);
    setExpired(false);
  }

  function confirmationPage(reservationId: string) {
    window.location.assign(`/checkout/success?reservation_id=${encodeURIComponent(reservationId)}`);
  }

  function validateContact() {
    if (!form.name.trim()) return "Please enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Please enter a valid email address.";
    return null;
  }

  async function leavePayment(nextStep: 1 | 2 | "home") {
    if (operationRef.current || paying) return;
    const current = draftRef.current;
    setError(null);
    if (current) {
      operationRef.current = true;
      setSubmitting(true);
      try {
        let result: CheckoutStatus;
        try {
          result = await checkoutRequest<CheckoutStatus>("/api/checkout/cancel", { reservationId: current.reservationId });
        } catch {
          // A lost cancellation response is not permission to create another
          // payment. Reconcile the existing reservation before moving on.
          result = await checkoutRequest<CheckoutStatus>("/api/checkout/status", { reservationId: current.reservationId });
        }
        if (!mountedRef.current) return;
        if (result.status === "paid" || result.status === "processing") {
          confirmationPage(current.reservationId);
          return;
        }
        if (result.status !== "released") {
          throw new Error("We couldn’t confirm that checkout was cancelled. Your checkout is saved; please try again.");
        }
        forget(current.reservationId);
      } catch (cause) {
        setError(cause instanceof Error && cause.name !== "AbortError"
          ? cause.message
          : "We couldn’t confirm that checkout was cancelled. Your checkout is saved; please try again.");
        return;
      } finally {
        operationRef.current = false;
        setSubmitting(false);
      }
    }
    if (nextStep === "home") router.push("/");
    else setStep(nextStep);
  }

  async function preparePaymentStep(saved?: CheckoutDraft) {
    if (operationRef.current || paying) return;
    operationRef.current = true;
    setError(null);
    setSubmitting(true);
    let current = saved ?? draftRef.current;
    try {
      if (!stripePromise) {
        throw new Error("Secure payment is unavailable right now. Please try again shortly.");
      }
      if (!current) {
        const contactError = validateContact();
        if (contactError) { setStep(1); throw new Error(contactError); }
        if (!form.address1.trim() || !form.city.trim()) throw new Error("Please enter your street address and city.");
        if (!/^[a-z]{2}$/i.test(form.state.trim())) throw new Error("Please use the two-letter state abbreviation, such as TX.");
        if (!/^\d{5}(?:-\d{4})?$/.test(form.zip.trim())) throw new Error("Please enter a valid U.S. ZIP code.");
        if (!cart.length || cart.length > 10) throw new Error("Please choose between 1 and 10 paintings for checkout.");
        const normalizedForm = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])) as CheckoutForm;
        normalizedForm.state = normalizedForm.state.toUpperCase();
        normalizedForm.email = normalizedForm.email.toLowerCase();
        const items = cart.map((painting) => ({ id: painting.id, slug: painting.slug }));
        current = {
          version: 1,
          reservationId: crypto.randomUUID(),
          form: normalizedForm,
          items,
          fingerprint: checkoutFingerprint(items, normalizedForm),
          summary: cart,
        };
        try { remember(current); }
        catch { throw new Error("Your browser couldn’t save checkout progress. Please allow site storage or try another browser."); }
        setForm(normalizedForm);
      }
      const data = await checkoutRequest<{
        clientSecret?: string;
        reservationId: string;
        total: number;
        expiresAt: string;
        items: Painting[];
        status?: CheckoutStatus["status"];
      }>("/api/checkout", {
        reservationId: current.reservationId,
        items: current.items,
        email: current.form.email,
        name: current.form.name,
        address: {
          line1: current.form.address1,
          line2: current.form.address2,
          city: current.form.city,
          state: current.form.state,
          postal_code: current.form.zip,
          country: "US",
        },
      });
      if (!mountedRef.current) return;
      if (data.status === "paid" || data.status === "processing") {
        confirmationPage(current.reservationId);
        return;
      }
      if (data.status === "released") {
        forget(current.reservationId);
        setStep(2);
        throw new Error("That reservation has ended. Continue to payment to check availability again.");
      }
      if (
        data.reservationId !== current.reservationId ||
        typeof data.clientSecret !== "string" ||
        !Number.isFinite(data.total) || data.total <= 0 ||
        !Array.isArray(data.items) || data.items.length === 0
      ) throw new Error("We couldn’t verify the payment details. Your checkout is saved; please try again.");
      const confirmedDraft = { ...current, total: data.total, expiresAt: data.expiresAt, summary: data.items };
      remember(confirmedDraft);
      setClientSecret(data.clientSecret);
      setStep(3);
    } catch (cause: unknown) {
      if (!mountedRef.current) return;
      if (current && draftRef.current?.reservationId === current.reservationId) {
        try {
          const result = await checkoutRequest<CheckoutStatus>("/api/checkout/status", { reservationId: current.reservationId });
          if (!mountedRef.current) return;
          if (result.status === "paid" || result.status === "processing") {
            confirmationPage(current.reservationId);
            return;
          }
          if (result.status === "released") {
            forget(current.reservationId);
            setStep(2);
            setError("That reservation has ended. Continue to payment to check availability again.");
            return;
          }
        } catch {
          // A missing or unreachable response may overlap the initial request.
          // Retain its reference instead of creating another checkout.
        }
      }
      setError(cause instanceof Error && cause.name !== "AbortError"
        ? cause.message
        : "We couldn’t confirm checkout yet. Your checkout is saved so you can retry safely.");
    } finally {
      operationRef.current = false;
      setSubmitting(false);
    }
  }

  if (!hydrated || !cartHydrated) {
    return <p role="status" className="muted" style={{ textAlign: "center", padding: "120px 24px" }}>Loading your checkout…</p>;
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
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "56px clamp(20px, 5vw, 48px) 120px" }}>
      <button
        type="button"
        onClick={() => void leavePayment("home")}
        disabled={busy}
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
      </button>

      <div
        className="checkout-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
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
                  type="button"
                  onClick={() => step > s.n && void leavePayment(s.n as 1 | 2)}
                  disabled={busy || step <= s.n}
                  aria-current={step === s.n ? "step" : undefined}
                  className="small-caps"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "clamp(4px, 0.75vw, 10px)",
                    fontSize: "clamp(9px, 1vw, 10.5px)",
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
                      flexShrink: 0,
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
                      margin: "0 clamp(4px, 1.2vw, 16px)",
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {error && (
            <div role="alert" style={{ background: "var(--paper-2)", padding: "12px 16px", marginBottom: 20, fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)", borderLeft: "2px solid var(--ink)" }}>
              {error}
            </div>
          )}

          {draft && (expired || cartChanged) && (
            <div role="status" style={{ background: "var(--paper-2)", padding: "16px", marginBottom: 20, fontSize: 13, lineHeight: 1.6 }}>
              <p>{expired ? "Your reservation time has ended. Check availability again before paying." : "Your cart has changed. Update checkout before paying."}</p>
              <button type="button" onClick={() => void leavePayment(1)} disabled={busy} style={{ marginTop: 8, textDecoration: "underline", textUnderlineOffset: 3 }}>
                {submitting ? "Updating checkout…" : "Update checkout"}
              </button>
            </div>
          )}

          {step === 1 && (
            <StepCard title="Contact information">
              <Field
                label="Email"
                value={form.email}
                onChange={(v) => set("email", v)}
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
                maxLength={254}
                disabled={Boolean(draft) || busy}
              />
              <Field
                label="Full name"
                value={form.name}
                onChange={(v) => set("name", v)}
                placeholder="First and last name"
                autoComplete="name"
                maxLength={120}
                disabled={Boolean(draft) || busy}
              />
              <Next
                onNext={() => {
                  const problem = validateContact();
                  setError(problem);
                  if (!problem) setStep(2);
                }}
                disabled={busy || !form.email.trim() || !form.name.trim()}
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
                autoComplete="address-line1"
                disabled={Boolean(draft) || busy}
              />
              <Field
                label="Apt / Suite (optional)"
                value={form.address2}
                onChange={(v) => set("address2", v)}
                autoComplete="address-line2"
                disabled={Boolean(draft) || busy}
              />
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)", gap: "clamp(10px, 1.2vw, 16px)" }}>
                <Field label="City" value={form.city} onChange={(v) => set("city", v)} autoComplete="address-level2" maxLength={100} disabled={Boolean(draft) || busy} />
                <Field label="State" value={form.state} onChange={(v) => set("state", v.toUpperCase())} placeholder="TX" autoComplete="address-level1" maxLength={2} disabled={Boolean(draft) || busy} />
                <Field label="ZIP" value={form.zip} onChange={(v) => set("zip", v)} autoComplete="postal-code" maxLength={10} disabled={Boolean(draft) || busy} />
              </div>
              <Next
                onNext={() => void preparePaymentStep()}
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
              {draft?.expiresAt && !expired && (
                <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  Reserved for checkout until {new Date(draft.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
                </p>
              )}
              {clientSecret && stripePromise && draft ? (
                <Elements
                  key={draft.reservationId}
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
                    clientSecret={clientSecret}
                    reservationId={draft.reservationId}
                    total={total}
                    setError={setError}
                    setPaying={setPaying}
                    disabled={expired || cartChanged || submitting}
                    onReleased={() => setExpired(true)}
                    billingDetails={{
                      name: form.name,
                      email: form.email,
                      address: {
                        line1: form.address1,
                        line2: form.address2 || undefined,
                        city: form.city,
                        state: form.state,
                        postal_code: form.zip,
                        country: "US",
                      },
                    }}
                  />
                </Elements>
              ) : (
                <Next
                  onNext={() => void preparePaymentStep()}
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
              {summaryItems.map((p) => (
                <li
                  key={p.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "56px minmax(0, 1fr) auto",
                    gap: 14,
                  }}
                >
                  <div style={{ width: 56 }}>
                    <PaintingImage painting={p} />
                  </div>
                  <div>
                    <div
                      className="serif italic"
                      style={{ fontSize: 14, lineHeight: 1.3, overflowWrap: "anywhere" }}
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
  clientSecret,
  reservationId,
  total,
  setError,
  setPaying,
  disabled,
  onReleased,
  billingDetails,
}: {
  clientSecret: string;
  reservationId: string;
  total: number;
  setError: (message: string | null) => void;
  setPaying: (value: boolean) => void;
  disabled: boolean;
  onReleased: () => void;
  billingDetails: {
    name: string;
    email: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    };
  };
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setLocalPaying] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const payingRef = useRef(false);

  function showConfirmation() {
    window.location.assign(`/checkout/success?reservation_id=${encodeURIComponent(reservationId)}`);
  }

  async function checkStatus() {
    const result = await checkoutRequest<CheckoutStatus>("/api/checkout/status", { reservationId });
    if (result.status === "paid" || result.status === "processing") {
      showConfirmation();
      return false;
    }
    if (result.status === "released") {
      onReleased();
      throw new Error("This reservation has ended. Update checkout to check availability again.");
    }
    if (result.status !== "pending") throw new Error("We couldn’t verify your checkout. Please try again.");
    return true;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stripe || !elements || disabled || payingRef.current || !cardComplete) return;

    setError(null);
    payingRef.current = true;
    setLocalPaying(true);
    setPaying(true);
    try {
      const card = elements.getElement(CardElement);
      if (!card) throw new Error("Card form is still loading. Please try again.");
      if (!await checkStatus()) return;

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card,
          billing_details: billingDetails,
        },
        return_url: `${window.location.origin}/checkout/success?reservation_id=${encodeURIComponent(reservationId)}`,
      });

      if (result.paymentIntent?.status === "succeeded" || result.paymentIntent?.status === "processing") {
        // Only the server's status verification clears purchased paintings.
        showConfirmation();
        return;
      }
      if (result.error) {
        // Preserve this PaymentIntent on declines and uncertain network
        // responses. Verify it before offering a retry with the same id.
        if (!await checkStatus()) return;
        throw new Error(result.error.message ?? "Payment was not completed. Please check your card details and try again.");
      }
      throw new Error("Your bank verification was not completed. Please try again with this checkout.");
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "AbortError"
        ? cause.message
        : "We couldn’t confirm payment yet. Your checkout is saved; please check its status before trying again.");
    } finally {
      payingRef.current = false;
      setLocalPaying(false);
      setPaying(false);
    }
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
        <CardElement
          onReady={() => setCardReady(true)}
          onChange={(event) => {
            setCardComplete(event.complete);
            if (event.error) setError(event.error.message);
          }}
          options={{
            disableLink: true,
            hidePostalCode: true,
            style: {
              base: {
                color: "#1C1915",
                fontFamily:
                  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: "18px",
                fontSmoothing: "antialiased",
                "::placeholder": {
                  color: "#9C9585",
                },
              },
              invalid: {
                color: "#A42F2F",
                iconColor: "#A42F2F",
              },
            },
          }}
        />
      </div>
      <button
        type="submit"
        disabled={!stripe || !elements || !cardReady || !cardComplete || paying || disabled}
        className="small-caps"
        style={{
          marginTop: 12,
          padding: "16px 24px",
          background: !stripe || !elements || !cardComplete || paying || disabled ? "var(--paper-3)" : "var(--ink)",
          color: !stripe || !elements || !cardComplete || paying || disabled ? "var(--ink-3)" : "var(--paper)",
          fontSize: 11,
          letterSpacing: "0.22em",
          cursor: !stripe || !elements || !cardComplete || paying || disabled ? "not-allowed" : "pointer",
        }}
      >
        {paying ? "Processing..." : `Pay securely · $${total}`}
      </button>
      <Link href={`/checkout/success?reservation_id=${encodeURIComponent(reservationId)}`} style={{ alignSelf: "center", fontSize: 12, textDecoration: "underline", textUnderlineOffset: 3, pointerEvents: paying ? "none" : "auto" }} aria-disabled={paying} tabIndex={paying ? -1 : undefined}>
        Check payment status
      </Link>
    </form>
  );
}

function StepCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        padding: "32px clamp(20px, 4vw, 36px)",
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
  autoComplete,
  maxLength = 200,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <span className="small-caps muted" style={{ fontSize: 10 }}>
        {label}
      </span>
      <input
        type={type}
        autoComplete={autoComplete}
        maxLength={maxLength}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          fontSize: 14,
          width: "100%",
          minWidth: 0,
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
