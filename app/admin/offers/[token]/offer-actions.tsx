"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OfferActions({
  token,
  initialAction,
  currentStatus,
}: {
  offerId: string;
  token: string;
  initialAction?: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [counter, setCounter] = useState("");
  const [mode, setMode] = useState<string | null>(
    initialAction && ["accept", "counter", "decline"].includes(initialAction)
      ? initialAction
      : null,
  );

  async function run(action: "accept" | "counter" | "decline") {
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
      router.refresh();
    } catch (err: unknown) {
      setResult(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const closed = ["accepted", "declined", "withdrawn"].includes(currentStatus);

  if (closed && !result) {
    return (
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.7 }}>
        This offer is already <strong>{currentStatus}</strong>. No further action.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {!mode && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ActionBtn onClick={() => setMode("accept")} label="Accept" />
          <ActionBtn onClick={() => setMode("counter")} label="Counter" variant="outline" />
          <ActionBtn onClick={() => setMode("decline")} label="Decline" variant="outline" />
        </div>
      )}

      {mode === "accept" && (
        <Confirm
          body="Accepting will mark the painting reserved, email the buyer a secure payment link, and flip the painting to sold once they pay."
          onConfirm={() => run("accept")}
          onCancel={() => setMode(null)}
          busy={busy}
          confirmLabel="Yes, accept offer"
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
