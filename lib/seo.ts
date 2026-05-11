import type { Painting } from "@/lib/types";

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://robertmorrow.art";

export const siteName = "Robert Morrow";
export const artistName = "Robert Morrow";
export const artistEmail = "robertmorrow2@verizon.net";

export const siteDescription =
  "Robert Morrow lives and works in Spicewood, Texas, west of Austin in the Hill Country. His paintings are rooted in limestone, scrub oak, hard sun, open water, and the shifting color of the Texas sky.";

export const siteLongDescription =
  "Robert Morrow lives and works in Spicewood, Texas, west of Austin in the Hill Country. His paintings are rooted in that landscape: limestone, scrub oak, hard sun, open water, and the shifting color of the Texas sky.";

export const seoKeywords = [
  "Robert Morrow artist",
  "Spicewood Texas artist",
  "Texas Hill Country artist",
  "Austin Hill Country artist",
  "Spicewood painter",
  "Texas sky paintings",
  "Hill Country painter",
  "Texas acrylic paintings",
  "acrylic landscape paintings",
  "original acrylic paintings for sale",
  "Texas landscape paintings for sale",
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

  return `${paintingTitle(painting)} is an original ${painting.medium.toLowerCase()} by Spicewood, Texas artist Robert Morrow. ${size}. Rooted in the Texas Hill Country landscape: limestone, scrub oak, hard sun, open water, and the shifting color of the Texas sky. ${priceText}`;
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
    ],
    knowsAbout: [
      "Acrylic painting",
      "Texas landscape painting",
      "Hill Country landscapes",
      "Spicewood Texas landscapes",
      "Texas sky paintings",
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
