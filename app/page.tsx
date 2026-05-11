import type { Metadata } from "next";
import Gallery from "@/components/gallery";
import { getPaintings } from "@/lib/paintings";
import {
  absoluteUrl,
  artistJsonLd,
  jsonLdScript,
  seoKeywords,
  siteDescription,
  siteLongDescription,
  siteName,
} from "@/lib/seo";

export const revalidate = 60; // re-render at most every minute

export const metadata: Metadata = {
  title: "Robert Morrow Paintings from Spicewood, Texas",
  description: siteDescription,
  keywords: seoKeywords,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Robert Morrow Paintings from Spicewood, Texas",
    description: siteDescription,
    url: absoluteUrl("/"),
    siteName,
    type: "website",
    images: [
      {
        url: absoluteUrl("/paintings/img_2395.jpg"),
        width: 1800,
        height: 1451,
        alt: "Original acrylic painting by Robert Morrow",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Robert Morrow Paintings from Spicewood, Texas",
    description: siteDescription,
    images: [absoluteUrl("/paintings/img_2395.jpg")],
  },
};

export default async function HomePage() {
  const paintings = await getPaintings();
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Robert Morrow paintings from Spicewood, Texas",
    description: siteLongDescription,
    url: absoluteUrl("/"),
    about: [
      "Texas acrylic painting",
      "Landscape paintings for sale",
      "Spicewood Texas artist",
      "Texas Hill Country landscapes",
      "Texas sky paintings",
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
