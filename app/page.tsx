import Gallery from "@/components/gallery";
import { getPaintings } from "@/lib/paintings";
import type { Series } from "@/lib/types";

export const revalidate = 60; // re-render at most every minute

export default async function HomePage({
  searchParams,
}: {
  searchParams: { series?: string };
}) {
  const paintings = await getPaintings();
  const seriesParam = searchParams.series as Series | undefined;
  const initial: "all" | Series =
    seriesParam === "abstract" || seriesParam === "nature" ? seriesParam : "all";
  return <Gallery paintings={paintings} initialSeries={initial} />;
}
