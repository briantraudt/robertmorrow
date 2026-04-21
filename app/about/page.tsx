import type { Metadata } from "next";
import AboutSection from "@/components/about-section";

export const metadata: Metadata = {
  title: "About the artist",
  description:
    "Robert Morrow paints small oil paintings, slowly, in a converted barn in southern New Hampshire.",
};

export default function AboutPage() {
  return <AboutSection />;
}
