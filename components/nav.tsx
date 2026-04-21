"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      <div className="nav-inner">
        <nav className="nav-links" aria-label="Primary">
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

        <Link href="/" className="nav-logo" style={{ textAlign: "center", lineHeight: 1.05 }}>
          <div
            className="serif nav-logo-title"
            style={{ fontWeight: 400, letterSpacing: "0.02em" }}
          >
            Robert Morrow
          </div>
        </Link>

        <div className="nav-actions">
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

          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            className="nav-menu-btn"
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <line x1="2" y1="2" x2="16" y2="16" stroke="currentColor" strokeWidth="1.3" />
                <line x1="16" y1="2" x2="2" y2="16" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            ) : (
              <svg width="20" height="14" viewBox="0 0 20 14" fill="none" aria-hidden>
                <line x1="0" y1="1" x2="20" y2="1" stroke="currentColor" strokeWidth="1.3" />
                <line x1="0" y1="7" x2="20" y2="7" stroke="currentColor" strokeWidth="1.3" />
                <line x1="0" y1="13" x2="20" y2="13" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <>
          <div
            className="nav-menu-backdrop"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <nav className="nav-menu-panel" aria-label="Primary">
            {links.map((l) => {
              const active = l.match(pathname);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="small-caps"
                  style={{
                    display: "block",
                    padding: "16px 0",
                    fontSize: 13,
                    letterSpacing: "0.22em",
                    color: active ? "var(--ink)" : "var(--ink-3)",
                    borderBottom: "1px solid var(--line-2)",
                  }}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </>
      )}
    </header>
  );
}
