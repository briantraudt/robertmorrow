"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links: { href: string; label: string }[] = [
  { href: "/about", label: "About the artist" },
  { href: "/contact", label: "Contact" },
  { href: "/contact?subject=Commission", label: "Commissions" },
  { href: "/policies/shipping", label: "Shipping" },
  { href: "/policies/returns", label: "Returns" },
  { href: "/policies/care", label: "Care & handling" },
];

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
        padding: "56px 48px 36px",
        background: "var(--paper-2)",
      }}
    >
      <div
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "20px 40px",
        }}
      >
        <div className="serif" style={{ fontSize: 26, fontWeight: 400 }}>
          Robert Morrow
        </div>

        <nav
          aria-label="Footer"
          className="footer-links"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px 28px",
            fontSize: 13,
            color: "var(--ink-2)",
          }}
        >
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      <div
        style={{
          maxWidth: 1440,
          margin: "40px auto 0",
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
        <div>
          © {new Date().getFullYear()} Robert Morrow. All works copyrighted to the artist.
        </div>
        <div>Made with care in Texas.</div>
      </div>
    </footer>
  );
}
