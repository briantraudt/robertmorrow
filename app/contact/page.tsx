import type { Metadata } from "next";
import ContactForm from "@/components/contact-form";
import { absoluteUrl, seoKeywords } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Contact Robert Morrow",
  description:
    "Contact Robert Morrow, a Spicewood, Texas artist whose paintings are rooted in the Hill Country landscape, open water, hard sun, scrub oak, limestone, and Texas sky.",
  keywords: [
    ...seoKeywords,
    "contact Robert Morrow",
    "buy Texas acrylic painting",
    "original paintings for sale Texas",
  ],
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact Robert Morrow",
    description:
      "Write to Spicewood, Texas artist Robert Morrow about original acrylic paintings.",
    url: absoluteUrl("/contact"),
  },
};

export default function ContactPage({
  searchParams,
}: {
  searchParams: { subject?: string };
}) {
  return (
    <section
      style={{ maxWidth: 1100, margin: "0 auto", padding: "96px 48px 120px" }}
    >
      <div className="micro muted" style={{ marginBottom: 24 }}>
        Write to Robert
      </div>
      <h1
        className="serif"
        style={{
          fontSize: "clamp(40px, 5vw, 68px)",
          fontWeight: 400,
          lineHeight: 1.05,
          letterSpacing: "-0.015em",
          maxWidth: 900,
        }}
      >
        Questions about a painting, local delivery, or shipping — send a note.
      </h1>

      <div
        className="contact-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 80,
          marginTop: 64,
        }}
      >
        <div>
          <ContactForm defaultSubject={searchParams.subject || "General inquiry"} />
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              padding: "24px 0",
              borderTop: "1px solid var(--line)",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div className="small-caps muted" style={{ fontSize: 10, marginBottom: 10 }}>
              Studio
            </div>
            <div className="serif" style={{ fontSize: 18, lineHeight: 1.5 }}>
              Spicewood, TX
            </div>
          </div>
          <div>
            <div className="small-caps muted" style={{ fontSize: 10, marginBottom: 10 }}>
              Direct
            </div>
            <div className="serif" style={{ fontSize: 18, lineHeight: 1.5 }}>
              robertmorrow2<span className="muted">@</span>verizon.net
            </div>
          </div>
          <div>
            <div className="small-caps muted" style={{ fontSize: 10, marginBottom: 10 }}>
              Response time
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.7 }}>
              Expect a reply within 1-2 days.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
