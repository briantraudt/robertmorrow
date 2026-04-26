import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Detail from "@/components/detail";
import { getPainting, getPaintings } from "@/lib/paintings";
import {
  absoluteUrl,
  jsonLdScript,
  paintingDescription,
  paintingJsonLd,
  paintingTitle,
  seoKeywords,
  siteName,
} from "@/lib/seo";

export const revalidate = 60;

export async function generateStaticParams() {
  const paintings = await getPaintings();
  return paintings.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const p = await getPainting(params.slug);
  if (!p) return { title: "Painting not found" };
  const title = paintingTitle(p);
  const description = paintingDescription(p);
  const image = p.images?.[0];
  return {
    title: `${title} — Original Acrylic Painting for Sale`,
    description,
    keywords: [
      ...seoKeywords,
      p.title,
      `${p.medium} for sale`,
      `${p.w} x ${p.h} acrylic painting`,
    ],
    alternates: {
      canonical: `/paintings/${p.slug}`,
    },
    openGraph: {
      title: `${title} — Robert Morrow`,
      description,
      url: absoluteUrl(`/paintings/${p.slug}`),
      siteName,
      type: "website",
      images: image?.url
        ? [
            {
              url: absoluteUrl(image.url),
              width: image.width,
              height: image.height,
              alt: image.alt || `${title} by Texas artist Robert Morrow`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — Robert Morrow`,
      description,
      images: image?.url ? [absoluteUrl(image.url)] : undefined,
    },
  };
}

export default async function PaintingPage({
  params,
}: {
  params: { slug: string };
}) {
  const painting = await getPainting(params.slug);
  if (!painting) notFound();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(paintingJsonLd(painting))}
      />
      <Detail painting={painting} />
    </>
  );
}
