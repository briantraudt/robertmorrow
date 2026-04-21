import type { Metadata } from "next";
import ContactForm from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Write to Robert Morrow about a painting, commission, or framing.",
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
        Questions about a painting, <span className="italic">commissions,</span>{" "}
        or framing — send a note.
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
              The old barn behind the house
              <br />
              Southern New Hampshire
            </div>
          </div>
          <div>
            <div className="small-caps muted" style={{ fontSize: 10, marginBottom: 10 }}>
              Direct
            </div>
            <div className="serif" style={{ fontSize: 18, lineHeight: 1.5 }}>
              robert<span className="muted">@</span>robertmorrow.art
              <br />
              <span className="muted" style={{ fontSize: 14 }}>(603) 555·0118</span>
            </div>
          </div>
          <div>
            <div className="small-caps muted" style={{ fontSize: 10, marginBottom: 10 }}>
              Response time
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.7 }}>
              Robert reads mail most mornings with coffee. Expect a reply within
              two or three days.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
