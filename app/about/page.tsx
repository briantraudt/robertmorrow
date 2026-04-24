import type { Metadata } from "next";
import AboutSection from "@/components/about-section";

export const metadata: Metadata = {
  title: "About the artist",
  description:
    "Robert Morrow paints acrylic works rooted in Spicewood, Texas, and the Cloudcroft, New Mexico, landscapes that inspire many of them.",
};

export default function AboutPage() {
  return <AboutSection />;
}
