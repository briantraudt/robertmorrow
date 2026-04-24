"use client";

// =======================================================================
// "Make offer" modal. Button lives on the painting detail panel. Opens a
// centered dialog with: amount, name, email, phone (optional), message.
// Submits to /api/offers.
// =======================================================================

import { useEffect, useState } from "react";
import { IconClose } from "./icons";
import type { Painting } from "@/lib/types";

export default function MakeOffer({ painting }: { painting: Painting }) {
  const hasPrice = painting.price > 0;
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    amount: "",
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  function close() {
    setOpen(false);
    // reset after the transition
    window.setTimeout(() => {
      setSent(false);
      setError(null);
      setForm({ amount: "", name: "", email: "", phone: "", message: "" });
    }, 400);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = parseInt(form.amount, 10);
    if (!amount || amount < 1) {
      setError("Please enter a valid offer amount.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          painting_id: painting.id,
          amount,
          name: form.name,
          email: form.email,
          phone: form.phone,
          message: form.message,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Could not submit offer.");
      }
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not submit offer.");
    } finally {
      setSubmitting(false);
    }
  }

  if (painting.status !== "available") return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="small-caps"
        style={{
          width: "100%",
          padding: "16px 24px",
          border: "1px solid var(--ink)",
          background: "transparent",
          color: "var(--ink)",
          fontSize: 11,
          letterSpacing: "0.22em",
          cursor: "pointer",
        }}
      >
        Make an offer
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Make an offer on ${painting.title}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(28,25,21,0.55)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            animation: "rm-fade-in .3s ease",
          }}
        >
          <div
            style={{
              background: "var(--paper)",
              width: "min(540px, 100%)",
              maxHeight: "min(86vh, 720px)",
              overflowY: "auto",
              animation: "rm-slide-in .35s cubic-bezier(.2,.7,.2,1)",
              border: "1px solid var(--line)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "24px 32px",
                borderBottom: "1px solid var(--line-2)",
              }}
            >
              <div>
                <div className="micro muted">Make an offer</div>
                <div
                  className="serif italic"
                  style={{ fontSize: 22, marginTop: 4, lineHeight: 1.2 }}
                >
                  {painting.title}
                </div>
              </div>
              <button onClick={close} style={{ color: "var(--ink-3)" }} aria-label="Close">
                <IconClose size={20} />
              </button>
            </div>

            {sent ? (
              <div style={{ padding: "48px 32px", textAlign: "center" }}>
                <div className="serif italic" style={{ fontSize: 28, marginBottom: 14 }}>
                  Thank you.
                </div>
                <p className="muted" style={{ lineHeight: 1.7, fontSize: 14 }}>
                  Robert has your offer and will reply within a few days. If he
                  accepts, you&apos;ll receive an email with a secure payment link.
                </p>
                <button
                  onClick={close}
                  className="small-caps"
                  style={{
                    marginTop: 28,
                    padding: "14px 26px",
                    border: "1px solid var(--ink)",
                    fontSize: 11,
                    letterSpacing: "0.22em",
                  }}
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={submit} style={{ padding: "28px 32px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
                <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                  {hasPrice ? (
                    <>
                      The listed price is{" "}
                      <span className="serif" style={{ color: "var(--ink)" }}>
                        ${painting.price}
                      </span>
                      . Offers under the asking price are welcome — Robert reads
                      every one. He&apos;ll reply personally.
                    </>
                  ) : (
                    <>
                      Robert has not added the final price for this work yet.
                      Send an offer or inquiry and he&apos;ll reply personally.
                    </>
                  )}
                </p>
                <OfferField
                  label="Your offer (USD)"
                  value={form.amount}
                  onChange={(v) => set("amount", v.replace(/[^0-9]/g, ""))}
                  placeholder={hasPrice ? `Up to $${painting.price}` : "Enter amount"}
                  inputMode="numeric"
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                  <OfferField
                    label="Your name"
                    value={form.name}
                    onChange={(v) => set("name", v)}
                    required
                  />
                  <OfferField
                    label="Email"
                    value={form.email}
                    onChange={(v) => set("email", v)}
                    type="email"
                    required
                  />
                </div>
                <OfferField
                  label="Phone (optional)"
                  value={form.phone}
                  onChange={(v) => set("phone", v)}
                  type="tel"
                />
                <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span className="small-caps muted" style={{ fontSize: 10 }}>
                    Note to Robert (optional)
                  </span>
                  <textarea
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                    rows={4}
                    style={{
                      fontSize: 14,
                      lineHeight: 1.6,
                      padding: "12px 2px",
                      borderBottom: "1px solid var(--line)",
                      resize: "vertical",
                    }}
                  />
                </label>
                {error && (
                  <div role="alert" style={{ fontSize: 13, color: "var(--ink-2)" }}>
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="small-caps"
                  style={{
                    marginTop: 4,
                    padding: "16px",
                    background: submitting ? "var(--paper-3)" : "var(--ink)",
                    color: submitting ? "var(--ink-3)" : "var(--paper)",
                    fontSize: 11,
                    letterSpacing: "0.22em",
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  {submitting ? "Sending…" : "Send offer"}
                </button>
                <div
                  className="muted"
                  style={{
                    fontSize: 10.5,
                    textAlign: "center",
                    letterSpacing: "0.05em",
                  }}
                >
                  No payment now. Robert reviews each offer personally.
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function OfferField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  inputMode?: "numeric" | "text" | "tel";
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="small-caps muted" style={{ fontSize: 10 }}>
        {label}
      </span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
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
