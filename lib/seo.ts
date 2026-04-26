import type { Painting } from "@/lib/types";

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://robertmorrow.art";

export const siteName = "Robert Morrow";
export const artistName = "Robert Morrow";
export const artistEmail = "robertmorrow2@verizon.net";

export const siteDescription =
  "Texas artist Robert Morrow paints acrylic landscapes and abstract works rooted in Spicewood, Texas, and the mountain light around Cloudcroft, New Mexico. Original paintings are available for sale.";

export const seoKeywords = [
  "Robert Morrow artist",
  "Texas artist",
  "Spicewood Texas artist",
  "Austin Hill Country artist",
  "Texas acrylic paintings",
  "acrylic landscape paintings",
  "original acrylic paintings for sale",
  "Texas landscape paintings for sale",
  "Cloudcroft New Mexico landscapes",
  "contemporary landscape painting",
  "abstract acrylic paintings",
];

export function absoluteUrl(path = "/") {
  if (path.startsWith("http")) return path;
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function paintingTitle(painting: Painting) {
  return painting.year > 0
    ? `${painting.title}, ${painting.year}`
    : painting.title;
}

export function paintingDescription(painting: Painting) {
  const size = `${painting.w}" x ${painting.h}"`;
  const priceText =
    painting.status === "sold"
      ? "This work has sold."
      : painting.price > 0
        ? `Available for sale for $${painting.price}.`
        : "Available for sale; price on request.";

  return `${paintingTitle(painting)} is an original ${painting.medium.toLowerCase()} by Texas artist Robert Morrow. ${size}. Inspired by the Texas Hill Country around Spicewood and the landscapes of Cloudcroft, New Mexico. ${priceText}`;
}

export function artistJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": absoluteUrl("/about#artist"),
    name: artistName,
    url: siteUrl,
    email: artistEmail,
    image: absoluteUrl("/about/robert-morrow.jpg"),
    jobTitle: "Artist",
    homeLocation: {
      "@type": "Place",
      name: "Spicewood, Texas",
    },
    workLocation: [
      {
        "@type": "Place",
        name: "Spicewood, Texas",
      },
      {
        "@type": "Place",
        name: "Cloudcroft, New Mexico",
      },
    ],
    knowsAbout: [
      "Acrylic painting",
      "Texas landscape painting",
      "Hill Country landscapes",
      "Cloudcroft New Mexico landscapes",
      "Contemporary landscape painting",
    ],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": absoluteUrl("/#website"),
    name: siteName,
    url: siteUrl,
    description: siteDescription,
    publisher: { "@id": absoluteUrl("/about#artist") },
  };
}

export function paintingJsonLd(painting: Painting) {
  const image = painting.images?.[0]?.url
    ? absoluteUrl(painting.images[0].url)
    : undefined;
  const availability =
    painting.status === "sold"
      ? "https://schema.org/SoldOut"
      : "https://schema.org/InStock";

  return {
    "@context": "https://schema.org",
    "@type": ["VisualArtwork", "Product"],
    "@id": absoluteUrl(`/paintings/${painting.slug}#artwork`),
    name: paintingTitle(painting),
    description: paintingDescription(painting),
    image,
    url: absoluteUrl(`/paintings/${painting.slug}`),
    artMedium: painting.medium,
    artworkSurface: "Canvas",
    width: {
      "@type": "QuantitativeValue",
      value: painting.w,
      unitCode: "INH",
    },
    height: {
      "@type": "QuantitativeValue",
      value: painting.h,
      unitCode: "INH",
    },
    creator: { "@id": absoluteUrl("/about#artist") },
    brand: { "@id": absoluteUrl("/about#artist") },
    offers: {
      "@type": "Offer",
      availability,
      priceCurrency: "USD",
      price: painting.price > 0 ? painting.price : undefined,
      url: absoluteUrl(`/paintings/${painting.slug}`),
      seller: { "@id": absoluteUrl("/about#artist") },
    },
  };
}

export function jsonLdScript(data: unknown) {
  return {
    __html: JSON.stringify(data).replace(/</g, "\\u003c"),
  };
}
