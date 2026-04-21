// =======================================================================
// /admin/offers/[token] — the page Robert lands on from the email's
// Accept / Counter / Decline buttons. The token is an unguessable UUID
// stored alongside the offer, so a cryptographically-secure URL doubles
// as the auth. For stronger access control wire this up with Supabase Auth.
//
// Accept: marks offer accepted, generates a Stripe payment link and emails
//         it to the buyer.
// Counter: shows a form to enter a counter amount.
// Decline: marks offer declined and emails the buyer a short polite note.
// =======================================================================

import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPainting } from "@/lib/paintings";
import OfferActions from "./offer-actions";

export const dynamic = "force-dynamic";

type OfferRow = {
  id: string;
  painting_id: string;
  name: string;
  email: string;
  phone: string | null;
  amount: number;
  message: string | null;
  status: string;
  counter: number | null;
  token: string;
  created_at: string;
};

export default async function AdminOfferPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { action?: string };
}) {
  let offer: OfferRow | null = null;
  try {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
      .from("offers")
      .select("*")
      .eq("token", params.token)
      .maybeSingle();
    offer = (data as OfferRow | null) ?? null;
  } catch {
    /* fall through */
  }

  if (!offer) notFound();
  const painting = await getPainting(offer.painting_id);

  return (
    <section style={{ maxWidth: 720, margin: "0 auto", padding: "80px 48px 120px" }}>
      <div className="micro muted" style={{ marginBottom: 24 }}>
        Offer · {offer.status}
      </div>
      <h1
        className="serif"
        style={{
          fontSize: "clamp(32px, 4vw, 48px)",
          fontWeight: 400,
          lineHeight: 1.05,
          letterSpacing: "-0.015em",
        }}
      >
        <span className="italic">{painting?.title ?? "Painting"}</span>
      </h1>
      {painting && (
        <div className="muted" style={{ marginTop: 8, fontSize: 14 }}>
          Listed at ${painting.price} · {painting.w}″ × {painting.h}″
        </div>
      )}

      <div
        style={{
          margin: "36px 0",
          padding: 28,
          border: "1px solid var(--line)",
          background: "var(--paper-2)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <div className="small-caps muted" style={{ fontSize: 10, marginBottom: 6 }}>
              From
            </div>
            <div className="serif" style={{ fontSize: 18 }}>{offer.name}</div>
            <div className="muted" style={{ fontSize: 13 }}>{offer.email}</div>
            {offer.phone && (
              <div className="muted" style={{ fontSize: 13 }}>{offer.phone}</div>
            )}
          </div>
          <div>
            <div className="small-caps muted" style={{ fontSize: 10, marginBottom: 6 }}>
              Offer
            </div>
            <div className="serif" style={{ fontSize: 28 }}>${offer.amount}</div>
            {offer.counter && (
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                countered at ${offer.counter}
              </div>
            )}
          </div>
        </div>
        {offer.message && (
          <blockquote
            className="serif italic muted"
            style={{
              marginTop: 24,
              paddingLeft: 16,
              borderLeft: "1px solid var(--line)",
              fontSize: 16,
            }}
          >
            “{offer.message}”
          </blockquote>
        )}
      </div>

      <OfferActions
        offerId={offer.id}
        token={offer.token}
        initialAction={searchParams.action}
        currentStatus={offer.status}
      />
    </section>
  );
}
