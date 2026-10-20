"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { safeStripeCheckoutUrl } from "@/lib/admin-validation";

export default function OfferActions({
  token,
  initialAction,
  currentStatus,
  initialPaymentUrl,
  offerAmount,
  counterAmount,
}: {
  offerId: string;
  token: string;
  initialAction?: string;
  currentStatus: string;
  initialPaymentUrl?: string | null;
  offerAmount: number;
  counterAmount?: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [counter, setCounter] = useState("");
  const [paymentUrl, setPaymentUrl] = useState<string | null>(initialPaymentUrl ?? null);
  const [mode, setMode] = useState<string | null>(
    initialAction && ["accept", "counter", "decline"].includes(initialAction)
      ? initialAction
      : null,
  );

  async function run(action: "accept" | "counter" | "decline") {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/offers/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          counter: action === "counter" ? parseInt(counter, 10) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      setResult(data.message || "Done.");
      if (data.paymentUrl) setPaymentUrl(safeStripeCheckoutUrl(data.paymentUrl));
      setMode(null);
      router.refresh();
    } catch (err: unknown) {
      setResult(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const closed = ["accepted", "declined", "withdrawn"].includes(currentStatus);
  const isCountered = currentStatus === "countered";
  const originalAmount = `$${offerAmount.toLocaleString("en-US")}`;

  if (closed) {
    return (
      <div role="status">
        {result && <p style={{ marginBottom: 12 }}>{result}</p>}
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.7 }}>
          This offer is <strong>{currentStatus}</strong>.
        </p>
        {currentStatus === "accepted" && paymentUrl && <PaymentLink url={paymentUrl} />}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {isCountered && (
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.7 }}>
          If the buyer agrees to {counterAmount ? `the $${counterAmount.toLocaleString("en-US")} counter` : "your counter"},
          ask them to submit a new offer at that amount. Accepting below uses their original {originalAmount} offer.
        </p>
      )}
      {!mode && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ActionBtn onClick={() => setMode("accept")} label={isCountered ? `Accept original ${originalAmount} offer` : "Accept"} />
          <ActionBtn onClick={() => setMode("counter")} label="Counter" variant="outline" />
          <ActionBtn onClick={() => setMode("decline")} label="Decline" variant="outline" />
        </div>
      )}

      {mode === "accept" && (
        <Confirm
          body={`${isCountered ? `Accepting charges the original ${originalAmount} offer when the buyer pays.` : `Accept the buyer's ${originalAmount} offer.`} The painting will be reserved for 24 hours, and the buyer will receive a secure payment link. Successful payment marks the painting sold.`}
          onConfirm={() => run("accept")}
          onCancel={() => setMode(null)}
          busy={busy}
          confirmLabel={isCountered ? `Accept original ${originalAmount} offer` : "Yes, accept offer"}
        />
      )}

      {mode === "counter" && (
        <div
          style={{
            padding: 24,
            border: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div className="small-caps muted" style={{ fontSize: 10 }}>
            Your counter-offer (USD)
          </div>
          <input
            aria-label="Counter-offer in US dollars"
            value={counter}
            onChange={(e) => setCounter(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="e.g. 550"
            style={{
              fontSize: 22,
              padding: "8px 2px",
              borderBottom: "1px solid var(--line)",
              fontFamily: "var(--display)",
            }}
          />
          <div style={{ display: "flex", gap: 12 }}>
            <ActionBtn
              onClick={() => run("counter")}
              label={busy ? "Sending…" : "Send counter"}
              disabled={!counter || busy}
            />
            <ActionBtn
              onClick={() => setMode(null)}
              label="Cancel"
              variant="ghost"
              disabled={busy}
            />
          </div>
        </div>
      )}

      {mode === "decline" && (
        <Confirm
          body="This will email the buyer a short polite decline note and close the offer."
          onConfirm={() => run("decline")}
          onCancel={() => setMode(null)}
          busy={busy}
          confirmLabel="Decline offer"
        />
      )}

      {result && (
        <div
          role="status"
          style={{
            marginTop: 8,
            padding: "16px 20px",
            background: "var(--paper-2)",
            fontSize: 14,
            borderLeft: "2px solid var(--ink)",
          }}
        >
          {result}
        </div>
      )}
      {paymentUrl && <PaymentLink url={paymentUrl} />}
    </div>
  );
}

function PaymentLink({ url }: { url: string }) {
  return (
    <div style={{ marginTop: 20, padding: 20, border: "1px solid var(--line)" }}>
      <label htmlFor="offer-checkout-link" className="small-caps muted" style={{ display: "block", fontSize: 10, marginBottom: 12 }}>Buyer checkout link</label>
      <input id="offer-checkout-link" readOnly value={url} onFocus={(event) => event.currentTarget.select()} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", background: "var(--paper)", fontSize: 12 }} />
      <a href={url} target="_blank" rel="noopener noreferrer" className="small-caps" style={{ display: "inline-block", marginTop: 14, fontSize: 10.5 }}>Open secure checkout →</a>
    </div>
  );
}

function Confirm({
  body,
  onConfirm,
  onCancel,
  busy,
  confirmLabel,
}: {
  body: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  confirmLabel: string;
}) {
  return (
    <div style={{ padding: 24, border: "1px solid var(--line)" }}>
      <p style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>{body}</p>
      <div style={{ display: "flex", gap: 12 }}>
        <ActionBtn
          onClick={onConfirm}
          label={busy ? "Working…" : confirmLabel}
          disabled={busy}
        />
        <ActionBtn onClick={onCancel} label="Cancel" variant="ghost" />
      </div>
    </div>
  );
}

function ActionBtn({
  onClick,
  label,
  variant = "solid",
  disabled,
}: {
  onClick: () => void;
  label: string;
  variant?: "solid" | "outline" | "ghost";
  disabled?: boolean;
}) {
  const base: React.CSSProperties = {
    padding: "14px 24px",
    fontSize: 11,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
  const styles =
    variant === "solid"
      ? { ...base, background: "var(--ink)", color: "var(--paper)" }
      : variant === "outline"
      ? { ...base, background: "transparent", color: "var(--ink)", border: "1px solid var(--ink)" }
      : { ...base, background: "transparent", color: "var(--ink-3)" };
  return (
    <button onClick={onClick} disabled={disabled} style={styles}>
      {label}
    </button>
  );
}
