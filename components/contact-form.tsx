"use client";

import { useState } from "react";

export default function ContactForm({
  defaultSubject = "General inquiry",
}: {
  defaultSubject?: string;
}) {
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: defaultSubject,
    message: "",
  });
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Could not send message.");
      }
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div
        style={{
          padding: "56px 40px",
          border: "1px solid var(--line)",
          background: "var(--paper-2)",
        }}
      >
        <div className="serif italic" style={{ fontSize: 32, marginBottom: 16 }}>
          Thank you, your note is on its way.
        </div>
        <p className="muted" style={{ lineHeight: 1.7 }}>
          Robert usually replies within a few days. If it&apos;s urgent, do call.
        </p>
        <button
          onClick={() => {
            setSent(false);
            setForm({ name: "", email: "", subject: defaultSubject, message: "" });
          }}
          className="small-caps"
          style={{
            marginTop: 24,
            fontSize: 11,
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        <TextField label="Your name" value={form.name} onChange={(v) => set("name", v)} required />
        <TextField
          label="Email"
          value={form.email}
          onChange={(v) => set("email", v)}
          type="email"
          required
        />
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="small-caps muted" style={{ fontSize: 10 }}>Subject</span>
        <select
          value={form.subject}
          onChange={(e) => set("subject", e.target.value)}
          style={{
            fontSize: 14,
            padding: "12px 2px",
            borderBottom: "1px solid var(--line)",
            cursor: "pointer",
            appearance: "none",
            WebkitAppearance: "none",
          }}
        >
          <option>General inquiry</option>
          <option>Question about a painting</option>
          <option>Commission</option>
          <option>Framing or shipping</option>
          <option>Press</option>
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="small-caps muted" style={{ fontSize: 10 }}>Your note</span>
        <textarea
          value={form.message}
          onChange={(e) => set("message", e.target.value)}
          rows={6}
          required
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
          alignSelf: "flex-start",
          marginTop: 8,
          padding: "16px 32px",
          background: submitting ? "var(--paper-3)" : "var(--ink)",
          color: submitting ? "var(--ink-3)" : "var(--paper)",
          fontSize: 11,
          letterSpacing: "0.22em",
          cursor: submitting ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? "Sending…" : "Send note"}
      </button>
    </form>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="small-caps muted" style={{ fontSize: 10 }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
