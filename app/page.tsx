import type { Metadata } from "next";
import Gallery from "@/components/gallery";
import { getPaintings } from "@/lib/paintings";
import {
  absoluteUrl,
  artistJsonLd,
  jsonLdScript,
  seoKeywords,
  siteDescription,
  siteName,
} from "@/lib/seo";

export const revalidate = 60; // re-render at most every minute

export const metadata: Metadata = {
  title: "Texas Acrylic Landscape Paintings for Sale",
  description: siteDescription,
  keywords: seoKeywords,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Texas Acrylic Landscape Paintings for Sale — Robert Morrow",
    description: siteDescription,
    url: absoluteUrl("/"),
    siteName,
    type: "website",
  },
};

export default async function HomePage() {
  const paintings = await getPaintings();
  const availableCount = paintings.filter((p) => p.status !== "sold").length;
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Texas acrylic landscape paintings for sale",
    description: siteDescription,
    url: absoluteUrl("/"),
    about: [
      "Texas acrylic painting",
      "Landscape paintings for sale",
      "Spicewood Texas artist",
      "Cloudcroft New Mexico landscapes",
    ],
    creator: { "@id": absoluteUrl("/about#artist") },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: paintings.length,
      itemListElement: paintings.slice(0, 40).map((painting, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(`/paintings/${painting.slug}`),
        name: painting.title,
      })),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([artistJsonLd(), collectionJsonLd])}
      />
      <section
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "72px 48px 10px",
        }}
      >
        <div className="micro muted" style={{ marginBottom: 18 }}>
          Original acrylic paintings for sale
        </div>
        <h1
          className="serif"
          style={{
            fontSize: "clamp(42px, 6vw, 88px)",
            fontWeight: 400,
            lineHeight: 0.98,
            maxWidth: 1000,
          }}
        >
          Texas acrylic landscapes by Robert Morrow
        </h1>
        <p
          style={{
            marginTop: 24,
            maxWidth: 760,
            fontSize: 17,
            lineHeight: 1.75,
            color: "var(--ink-2)",
          }}
        >
          Robert Morrow is a Texas artist based in Spicewood, west of Austin in
          the Hill Country. His original acrylic paintings draw from Central
          Texas light, scrub oak, limestone, open water, and the mountain
          landscapes around Cloudcroft, New Mexico. Browse {availableCount}{" "}
          available works, including abstract landscapes and small acrylic
          paintings on canvas.
        </p>
      </section>
      <Gallery paintings={paintings} />
    </>
  );
}
