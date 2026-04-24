export default function AboutSection() {
  return (
    <section style={{ maxWidth: 1100, margin: "0 auto", padding: "96px 48px 120px" }}>
      <div className="micro muted" style={{ marginBottom: 24 }}>
        About the artist
      </div>
      <h1
        className="serif"
        style={{
          fontSize: "clamp(44px, 6vw, 76px)",
          fontWeight: 400,
          lineHeight: 1.0,
          letterSpacing: "-0.015em",
          maxWidth: 900,
        }}
      >
        Robert Morrow paints from the Hill Country, with one eye toward the
        mountains.
      </h1>

      <div
        className="about-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.3fr",
          gap: 80,
          marginTop: 72,
        }}
      >
        <div>
          <div
            style={{
              aspectRatio: "4 / 5",
              background: "var(--paper-2)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <img
              src="/about/robert-morrow.jpg"
              alt="Robert Morrow"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>
          <div
            className="muted"
            style={{ fontSize: 11.5, marginTop: 14, letterSpacing: "0.08em" }}
          >
            ROBERT IN THE STUDIO, 2024
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
            fontSize: 16,
            lineHeight: 1.75,
          }}
        >
          <p
            className="serif"
            style={{
              fontSize: 22,
              lineHeight: 1.55,
              fontStyle: "italic",
              color: "var(--ink-2)",
            }}
          >
            These paintings come out of long looking: the dry light of Central
            Texas, the high-country air of New Mexico, and the quiet discipline
            of returning to the same questions over time.
          </p>
          <p>
            Robert Morrow lives and works in Spicewood, Texas, west of Austin
            in the Hill Country. His paintings are rooted in that landscape:
            limestone, scrub oak, hard sun, open water, and the shifting color
            of the Texas sky.
          </p>
          <p>
            Each summer, Robert spends time in Cloudcroft, New Mexico, where
            the Sacramento Mountains offer a different kind of light and
            distance. Many of the landscapes begin there, from mountain roads,
            tree lines, weather, and the sudden changes between shadow and sun.
          </p>
          <p>
            Robert studied art in California and has continued painting
            steadily for decades. He works primarily in acrylic on canvas,
            building small compositions through color, memory, and observation
            rather than strict description.
          </p>
          <p>
            The works are signed on the front and inscribed on the back with
            title, date, and number. They ship flat-packed and unframed unless
            you write to ask otherwise.
          </p>

          <div
            style={{
              marginTop: 16,
              padding: "24px 0",
              borderTop: "1px solid var(--line)",
              borderBottom: "1px solid var(--line)",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 24,
            }}
          >
            <Stat n="50+" label="Years painting" />
            <Stat n="Spicewood, TX" label="Working from" />
            <Stat n="Acrylic" label="Primary medium" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div
        className="serif"
        style={{ fontSize: 24, fontWeight: 400, letterSpacing: "-0.01em" }}
      >
        {n}
      </div>
      <div className="small-caps muted" style={{ fontSize: 10, marginTop: 6 }}>
        {label}
      </div>
    </div>
  );
}
