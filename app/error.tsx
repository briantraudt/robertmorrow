"use client";

export default function SiteError({ reset }: { reset: () => void }) {
  return <section style={{ maxWidth: 640, margin: "80px auto", padding: 24, textAlign: "center" }}>
    <h1 className="serif" style={{ fontSize: 36, fontWeight: 400 }}>Please try again in a moment.</h1>
    <p className="muted" style={{ margin: "24px 0", lineHeight: 1.7 }}>We couldn’t load the current painting information. Please refresh before continuing.</p>
    <button onClick={reset} className="small-caps" style={{ padding: "14px 24px", border: "1px solid var(--ink)" }}>Try again</button>
  </section>;
}
