import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/components/cart-provider";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import CartDrawer from "@/components/cart-drawer";
import DetailOverlay from "@/components/detail-overlay";
import Toast from "@/components/toast";
import {
  absoluteUrl,
  artistJsonLd,
  jsonLdScript,
  seoKeywords,
  siteDescription,
  siteName,
  siteUrl,
  websiteJsonLd,
} from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Robert Morrow | Spicewood Texas Hill Country Artist",
    template: "%s · Robert Morrow",
  },
  description: siteDescription,
  keywords: seoKeywords,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Robert Morrow | Spicewood Texas Hill Country Artist",
    description: siteDescription,
    url: siteUrl,
    siteName,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: absoluteUrl("/about/robert-morrow.jpg"),
        width: 768,
        height: 992,
        alt: "Texas artist Robert Morrow",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Robert Morrow | Spicewood Texas Hill Country Artist",
    description: siteDescription,
    images: [absoluteUrl("/about/robert-morrow.jpg")],
  },
  robots: {
    index: true,
    follow: true,
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript([websiteJsonLd(), artistJsonLd()])}
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
