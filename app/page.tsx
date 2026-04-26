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
      <Gallery paintings={paintings} />
    </>
  );
}
