import type { MetadataRoute } from "next";
import { getPaintings } from "@/lib/paintings";
import { absoluteUrl } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paintings = await getPaintings();
  const now = new Date();

  return [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/about"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/contact"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...paintings.map((painting) => ({
      url: absoluteUrl(`/paintings/${painting.slug}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: painting.status === "available" ? 0.9 : 0.6,
    })),
  ];
}
