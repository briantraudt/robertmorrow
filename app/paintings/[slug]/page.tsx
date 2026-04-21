import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Detail from "@/components/detail";
import { getPainting, getPaintings } from "@/lib/paintings";

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
  return {
    title: `${p.title}, ${p.year}`,
    description: `${p.medium}, ${p.w}″ × ${p.h}″. Oil painting by Robert Morrow.`,
    openGraph: {
      title: `${p.title}, ${p.year} — Robert Morrow`,
      images: p.images?.[0]?.url ? [{ url: p.images[0].url }] : undefined,
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
  return <Detail painting={painting} />;
}
