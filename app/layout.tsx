import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/components/cart-provider";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import CartDrawer from "@/components/cart-drawer";
import DetailOverlay from "@/components/detail-overlay";
import Toast from "@/components/toast";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://robertmorrow.art";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Robert Morrow — Paintings",
    template: "%s · Robert Morrow",
  },
  description:
    "Acrylic paintings by Robert Morrow, rooted in Spicewood, Texas, and the landscapes around Cloudcroft, New Mexico.",
  openGraph: {
    title: "Robert Morrow — Paintings",
    description:
      "Acrylic paintings by Robert Morrow, rooted in Spicewood, Texas, and the landscapes around Cloudcroft, New Mexico.",
    url: siteUrl,
    siteName: "Robert Morrow",
    type: "website",
  },
  // Favicon lives at app/icon.svg — Next.js picks it up via file convention.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Inter:wght@300;400;500;600&display=swap"
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <CartProvider>
          <Nav />
          <main id="main">{children}</main>
          <Footer />
          <CartDrawer />
          <DetailOverlay />
          <Toast />
        </CartProvider>
      </body>
    </html>
  );
}
