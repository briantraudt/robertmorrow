"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Incorrect password.");
        setLoading(false);
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Network error.");
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--paper)",
        padding: 32,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 360,
          padding: 40,
          border: "1px solid var(--line)",
          background: "var(--paper)",
        }}
      >
        <h1
          className="serif"
          style={{ fontSize: 28, fontWeight: 400, marginBottom: 6 }}
        >
          Studio
        </h1>
        <p className="muted" style={{ fontSize: 13, marginBottom: 28 }}>
          Enter the studio password to manage paintings.
        </p>

        <label
          className="small-caps muted"
          style={{ fontSize: 10, letterSpacing: "0.22em", display: "block", marginBottom: 8 }}
        >
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          style={{
            width: "100%",
            padding: "12px 14px",
            border: "1px solid var(--line)",
            fontSize: 15,
            background: "var(--paper)",
            marginBottom: 16,
          }}
        />

        {error && (
          <div style={{ color: "#a42f2f", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          className="small-caps"
          style={{
            width: "100%",
            padding: "14px 16px",
            background: "var(--ink)",
            color: "var(--paper)",
            fontSize: 11,
            letterSpacing: "0.22em",
            opacity: loading || !password ? 0.5 : 1,
            cursor: loading || !password ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
