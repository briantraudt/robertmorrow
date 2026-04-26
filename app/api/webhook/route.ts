// =======================================================================
// POST /api/webhook  — Stripe webhook endpoint
//
// Configure from Stripe → Developers → Webhooks → Add endpoint:
//   URL:    https://robertmorrow.art/api/webhook
//   Events: checkout.session.completed, payment_intent.succeeded
// Copy the signing secret into STRIPE_WEBHOOK_SECRET.
//
// On success: inserts an `orders` row and flips painting.status to 'sold'.
// =======================================================================

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SEED_PAINTINGS } from "@/lib/seed-data";

export const runtime = "nodejs";
// Next.js doesn't let us access the raw body in a Route Handler by default,
// so we read text() and hand it to Stripe's signature verifier as-is.

type SupabaseServerClient = ReturnType<typeof createServerSupabaseClient>;

async function insertMissingSeedPaintings(
  supabase: SupabaseServerClient,
  paintingIds: string[],
) {
  if (!paintingIds.length) return;

  const { data: existing } = await supabase
    .from("paintings")
    .select("id")
    .in("id", paintingIds);
  const existingIds = new Set((existing ?? []).map((p) => p.id));
  const missingSeeds = SEED_PAINTINGS.filter(
    (p) => paintingIds.includes(p.id) && !existingIds.has(p.id),
  );

  if (!missingSeeds.length) return;

  const { error } = await supabase.from("paintings").insert(
    missingSeeds.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      year: p.year,
      series: p.series || "abstract",
      medium: p.medium,
      w: p.w,
      h: p.h,
      price: p.price,
      status: p.status,
      note: p.note,
      palette: p.palette ?? null,
      aspect: p.aspect ?? null,
    })),
  );
  if (error) throw error;
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not set." },
      { status: 500 },
    );
  }

  const sig = req.headers.get("stripe-signature") ?? "";
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : "invalid signature";
    return NextResponse.json({ error: `Webhook error: ${m}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const paintingIds = (session.metadata?.painting_ids ?? "")
      .split(",")
      .filter(Boolean);

    try {
      const supabase = createServerSupabaseClient();
      await supabase.from("orders").upsert(
        {
          stripe_session_id: session.id,
          stripe_payment_intent:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id,
          email: session.customer_details?.email ?? session.customer_email ?? null,
          name: session.customer_details?.name ?? null,
          amount_total: session.amount_total ?? 0,
          currency: session.currency ?? "usd",
          status: "paid",
          painting_ids: paintingIds,
          shipping_address: (session.shipping_details ?? null) as unknown as object,
        },
        { onConflict: "stripe_session_id" },
      );

      if (paintingIds.length) {
        await insertMissingSeedPaintings(supabase, paintingIds);
        await supabase
          .from("paintings")
          .update({ status: "sold" })
          .in("id", paintingIds);
      }
    } catch (err) {
      console.error("[webhook] database write failed", err);
      // The order upsert is idempotent, so ask Stripe to retry if we could
      // not reliably record the sale or mark the painting sold.
      return NextResponse.json(
        { error: "Webhook database write failed." },
        { status: 500 },
      );
    }
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const paintingIds = (paymentIntent.metadata?.painting_ids ?? "")
      .split(",")
      .filter(Boolean);

    try {
      const supabase = createServerSupabaseClient();
      await supabase.from("orders").upsert(
        {
          stripe_session_id: paymentIntent.id,
          stripe_payment_intent: paymentIntent.id,
          email: paymentIntent.receipt_email ?? null,
          name: paymentIntent.shipping?.name ?? paymentIntent.metadata?.buyer_name ?? null,
          amount_total: paymentIntent.amount_received || paymentIntent.amount,
          currency: paymentIntent.currency ?? "usd",
          status: "paid",
          painting_ids: paintingIds,
          shipping_address: (paymentIntent.shipping ?? null) as unknown as object,
        },
        { onConflict: "stripe_session_id" },
      );

      if (paintingIds.length) {
        await insertMissingSeedPaintings(supabase, paintingIds);
        await supabase
          .from("paintings")
          .update({ status: "sold" })
          .in("id", paintingIds);
      }
    } catch (err) {
      console.error("[webhook] payment intent database write failed", err);
      return NextResponse.json(
        { error: "Webhook database write failed." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ received: true });
}
