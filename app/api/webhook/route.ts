// =======================================================================
// POST /api/webhook  — Stripe webhook endpoint
//
// Configure from Stripe → Developers → Webhooks → Add endpoint:
//   URL:    https://robertmorrow.art/api/webhook
//   Events: checkout.session.completed
// Copy the signing secret into STRIPE_WEBHOOK_SECRET.
//
// On success: inserts an `orders` row and flips painting.status to 'sold'.
// =======================================================================

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
// Next.js doesn't let us access the raw body in a Route Handler by default,
// so we read text() and hand it to Stripe's signature verifier as-is.

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
        await supabase
          .from("paintings")
          .update({ status: "sold" })
          .in("id", paintingIds);
      }
    } catch (err) {
      console.error("[webhook] database write failed", err);
      // Don't throw — Stripe will retry if we return 5xx, and we don't want
      // a DB blip to cause duplicate orders on retry.
    }
  }

  return NextResponse.json({ received: true });
}
