"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./cart-provider";

const links = [
  { href: "/", label: "Paintings", match: (p: string) => p === "/" || p.startsWith("/paintings") },
  { href: "/about", label: "About", match: (p: string) => p.startsWith("/about") },
  { href: "/contact", label: "Contact", match: (p: string) => p.startsWith("/contact") },
];

export default function Nav() {
  const pathname = usePathname() || "/";
  const { cart, openCart } = useCart();
  const cartCount = cart.length;

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "rgba(247, 244, 238, 0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--line-2)",
      }}
    >
      <div
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "22px 48px",
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 24,
        }}
      >
        <nav style={{ display: "flex", gap: 32 }} aria-label="Primary">
          {links.map((l) => {
            const active = l.match(pathname);
            return (
              <Link
                key={l.href}
                href={l.href}
                className="small-caps"
                style={{
                  color: active ? "var(--ink)" : "var(--ink-3)",
                  fontSize: 11,
                  letterSpacing: "0.2em",
                  borderBottom: active ? "1px solid var(--ink)" : "1px solid transparent",
                  paddingBottom: 2,
                  transition: "color .2s, border-color .2s",
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <Link href="/" style={{ textAlign: "center", lineHeight: 1.05 }}>
          <div
            className="serif"
            style={{ fontSize: 26, fontWeight: 400, letterSpacing: "0.02em" }}
          >
            Robert Morrow
          </div>
          <div className="micro muted" style={{ marginTop: 4, fontSize: 9 }}>
            Paintings · Est. 1968
          </div>
        </Link>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 18,
          }}
        >
          <button
            className="small-caps muted"
            style={{ fontSize: 11, letterSpacing: "0.2em" }}
            aria-label="Search (coming soon)"
          >
            Search
          </button>
          <button
            onClick={openCart}
            className="small-caps"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              letterSpacing: "0.2em",
            }}
            aria-label={`Open cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
          >
            Cart
            <span
              style={{
                minWidth: 20,
                height: 20,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: cartCount > 0 ? "var(--ink)" : "transparent",
                color: cartCount > 0 ? "var(--paper)" : "var(--ink-3)",
                border: cartCount > 0 ? "none" : "1px solid var(--line)",
                borderRadius: 999,
                fontSize: 10,
                letterSpacing: 0,
                fontWeight: 500,
                padding: "0 6px",
              }}
            >
              {cartCount}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
