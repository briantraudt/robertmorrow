"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "./cart-provider";

const links = [
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

  // Hide site nav on admin routes (except the token-auth offer approval page,
  // which lives at /admin/offers/[token] and is shown to buyers, not the admin).
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/offers/")) {
    return null;
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "rgba(252, 250, 246, 0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--line-2)",
      }}
    >
      <div className="nav-inner">
        <div className="nav-left">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            className="nav-menu-btn"
          >
            {menuOpen ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <line x1="3" y1="3" x2="17" y2="17" stroke="currentColor" strokeWidth="1.3" />
                <line x1="17" y1="3" x2="3" y2="17" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            ) : (
              <svg width="22" height="14" viewBox="0 0 22 14" fill="none" aria-hidden>
                <line x1="0" y1="1" x2="22" y2="1" stroke="currentColor" strokeWidth="1.3" />
                <line x1="0" y1="7" x2="22" y2="7" stroke="currentColor" strokeWidth="1.3" />
                <line x1="0" y1="13" x2="22" y2="13" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            )}
          </button>

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
        </div>

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
            className="nav-cart-btn"
            aria-label={`Open cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M2.5 3.5h3L7.8 15h11l2.2-8.5H7" />
              <circle cx="9.5" cy="19.5" r="1.3" />
              <circle cx="17.5" cy="19.5" r="1.3" />
            </svg>
            {cartCount > 0 && (
              <span className="nav-cart-badge" aria-hidden>
                {cartCount}
              </span>
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
