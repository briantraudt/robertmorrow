// =======================================================================
// /admin/offers/[token] — the page Robert lands on from the email's
// Accept / Counter / Decline buttons. The token is an unguessable UUID
// stored alongside the offer. Studio authentication is required as well.
//
// Accept: marks offer accepted, generates a Stripe payment link and emails
//         it to the buyer.
// Counter: shows a form to enter a counter amount.
// Decline: marks offer declined and emails the buyer a short polite note.
// =======================================================================

import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPainting } from "@/lib/paintings";
import { requireAdmin } from "@/lib/admin-auth";
import OfferActions from "./offer-actions";
import { safeStripeCheckoutUrl } from "@/lib/admin-validation";

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
  internal_note: string | null;
};

export default async function AdminOfferPage(context: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const [params, searchParams] = await Promise.all([context.params, context.searchParams]);
  await requireAdmin(`/admin/offers/${encodeURIComponent(params.token)}${searchParams.action ? `?action=${encodeURIComponent(searchParams.action)}` : ""}`);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.token)) notFound();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("offers").select("*").eq("token", params.token).maybeSingle();
  if (error) throw error;
  const offer = (data as OfferRow | null) ?? null;

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
              {offer.counter ? "Original offer" : "Offer"}
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
        initialPaymentUrl={offer.status === "accepted" ? safeStripeCheckoutUrl(offer.internal_note) : null}
        offerAmount={offer.amount}
        counterAmount={offer.counter}
      />
    </section>
  );
}
