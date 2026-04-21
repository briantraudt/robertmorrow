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
        Robert has been painting, <span className="italic">quietly,</span> for
        most of his life.
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
              background: "linear-gradient(140deg, #D8CCB4, #8E7A58 60%, #4A3E28)",
              position: "relative",
            }}
            aria-label="Placeholder portrait of the artist"
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0, rgba(0,0,0,0.06) 1px, transparent 1px, transparent 9px)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "flex-end",
                padding: 24,
              }}
            >
              <div className="micro" style={{ color: "var(--paper)", opacity: 0.85 }}>
                [ portrait of the artist ]
              </div>
            </div>
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
            These are small paintings, made slowly. I don't paint for a living
            — I paint to look carefully at things. After fifty years of doing
            that, it seemed time to let some of them go.
          </p>
          <p>
            Robert Morrow was born in 1946 and has lived most of his life in
            southern New Hampshire. He studied drawing at the Museum School in
            Boston, then spent his working years as a carpenter and
            cabinetmaker — painting, always, on weekends and in winters.
          </p>
          <p>
            He works in oil, primarily on linen and small birch panels. The
            subjects come from walks, from half-remembered rooms, from the
            backs of envelopes. Most are painted in a converted barn behind
            the house.
          </p>
          <p>
            Each painting is signed on the front and inscribed on the back
            with its title, date, and number. Works ship flat-packed and
            unframed unless you write to ask otherwise.
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
            <Stat n="New Hampshire" label="Working from" />
            <Stat n="Oil" label="Primary medium" />
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
