import type { Metadata } from "next";
import AboutSection from "@/components/about-section";
import { absoluteUrl, seoKeywords } from "@/lib/seo";

export const metadata: Metadata = {
  title: "About Texas Artist Robert Morrow",
  description:
    "Learn about Robert Morrow, a Spicewood, Texas artist painting original acrylic landscapes inspired by the Texas Hill Country and Cloudcroft, New Mexico.",
  keywords: [
    ...seoKeywords,
    "about Robert Morrow",
    "Texas Hill Country painter",
    "California art school artist",
  ],
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About Texas Artist Robert Morrow",
    description:
      "Robert Morrow paints original acrylic landscapes rooted in Spicewood, Texas, and Cloudcroft, New Mexico.",
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
