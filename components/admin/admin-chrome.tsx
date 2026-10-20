"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign-out failed.");
      router.push("/admin/login");
      router.refresh();
    } catch {
      setError("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <header
        style={{
          borderBottom: "1px solid var(--line-2)",
          background: "var(--paper)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "18px 32px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          <Link href="/admin" className="serif" style={{ fontSize: 20 }}>
            Robert Morrow <span className="muted italic">· Studio</span>
          </Link>
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <Link href="/" className="small-caps muted" style={{ fontSize: 10.5 }}>
              View site →
            </Link>
            <button
              onClick={logout}
              disabled={signingOut}
              className="small-caps"
              style={{
                fontSize: 10.5,
                letterSpacing: "0.22em",
                color: "var(--ink-3)",
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </header>
      {error && <p role="alert" style={{ padding: "12px 32px", color: "#a42f2f" }}>{error}</p>}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 32px 120px" }}>
        {children}
      </main>
    </div>
  );
}
