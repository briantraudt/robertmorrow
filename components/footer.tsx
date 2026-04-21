"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname() || "/";
  // Hide footer on admin routes (except the public token-auth offer approval page).
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/offers/")) {
    return null;
  }
  return (
    <footer
      style={{
        borderTop: "1px solid var(--line)",
        padding: "64px 48px 40px",
        background: "var(--paper-2)",
      }}
    >
      <div
        className="footer-grid"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          gap: 48,
        }}
      >
        <div>
          <div className="serif" style={{ fontSize: 26, fontWeight: 400 }}>
            Robert Morrow
          </div>
          <div
            className="muted"
            style={{
              fontSize: 13,
              marginTop: 10,
              maxWidth: 320,
              lineHeight: 1.7,
            }}
          >
            Small oil paintings, made slowly in a converted barn in southern New
            Hampshire. Shipped by the artist himself.
          </div>
        </div>

        <FooterCol title="Shop">
          <Link href="/">All paintings</Link>
          <Link href="/?series=abstract">Abstract</Link>
          <Link href="/?series=nature">Nature</Link>
        </FooterCol>

        <FooterCol title="Studio">
          <Link href="/about">About the artist</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/contact?subject=Commission">Commissions</Link>
        </FooterCol>

        <FooterCol title="Policies">
          <Link href="/policies/shipping">Shipping</Link>
          <Link href="/policies/returns">Returns</Link>
          <Link href="/policies/care">Care &amp; handling</Link>
        </FooterCol>
      </div>

      <div
        style={{
          maxWidth: 1440,
          margin: "48px auto 0",
          paddingTop: 24,
          borderTop: "1px solid var(--line)",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          fontSize: 11,
          color: "var(--ink-3)",
          letterSpacing: "0.05em",
        }}
      >
        <div>© {new Date().getFullYear()} Robert Morrow. All works copyrighted to the artist.</div>
        <div>Made with care in New Hampshire.</div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="small-caps" style={{ fontSize: 10.5, marginBottom: 16 }}>
        {title}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          fontSize: 13,
          color: "var(--ink-2)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
