"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
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
              className="small-caps"
              style={{
                fontSize: 10.5,
                letterSpacing: "0.22em",
                color: "var(--ink-3)",
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 32px 120px" }}>
        {children}
      </main>
    </div>
  );
}
