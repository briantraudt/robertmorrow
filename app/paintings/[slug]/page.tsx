import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Detail from "@/components/detail";
import { getPainting } from "@/lib/paintings";
import {
  absoluteUrl,
  jsonLdScript,
  paintingDescription,
  paintingJsonLd,
  paintingTitle,
  seoKeywords,
  siteName,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPainting(slug);
  if (!p) return { title: "Painting not found" };
  const title = paintingTitle(p);
  const description = paintingDescription(p);
  const image = p.images?.[0];
  return {
    title: `${title} — Original ${/oil/i.test(p.medium) ? "Oil" : "Acrylic"} Painting${p.status === "available" ? " for Sale" : ""}`,
    description,
    keywords: [
      ...seoKeywords,
      p.title,
      `${p.medium} for sale`,
      `${p.w} x ${p.h} ${p.medium}`,
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
              alt: `${title} by Texas artist Robert Morrow`,
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
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const painting = await getPainting(slug);
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
