import type { Metadata } from "next";
import AboutSection from "@/components/about-section";
import { absoluteUrl, seoKeywords } from "@/lib/seo";

export const metadata: Metadata = {
  title: "About Robert Morrow, Spicewood Texas Artist",
  description:
    "Robert Morrow lives and works in Spicewood, Texas, west of Austin in the Hill Country. His paintings are rooted in limestone, scrub oak, hard sun, open water, and the shifting color of the Texas sky.",
  keywords: [
    ...seoKeywords,
    "about Robert Morrow",
    "Texas Hill Country painter",
    "Spicewood Texas painter",
  ],
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About Robert Morrow, Spicewood Texas Artist",
    description:
      "Robert Morrow lives and works in Spicewood, Texas, west of Austin in the Hill Country. His paintings are rooted in limestone, scrub oak, hard sun, open water, and the shifting color of the Texas sky.",
    url: absoluteUrl("/about"),
    images: [
      {
        url: absoluteUrl("/about/robert-morrow.jpg"),
        width: 768,
        height: 992,
        alt: "Texas artist Robert Morrow",
      },
    ],
  },
};

export default function AboutPage() {
  return <AboutSection />;
}
