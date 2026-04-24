import Gallery from "@/components/gallery";
import { getPaintings } from "@/lib/paintings";

export const revalidate = 60; // re-render at most every minute

export default async function HomePage() {
  const paintings = await getPaintings();
  return <Gallery paintings={paintings} />;
}
