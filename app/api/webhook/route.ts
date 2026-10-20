import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { finalizePayment, finalizeSession, getReservation, cancelReservation } from "@/lib/inventory";
import { getInventoryWebhookSecret } from "@/lib/inventory-webhooks";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature || signature.length > 4096
    || !/(?:^|,)\s*t=\d+(?:\s*,|\s*$)/.test(signature)
    || !/(?:^|,)\s*v1=[a-f0-9]{64}(?:\s*,|\s*$)/i.test(signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }
  let secret: string | undefined;
  try { secret = await getInventoryWebhookSecret(); }
  catch { return NextResponse.json({ error: "Payment webhook is unavailable." }, { status: 503 }); }
  if (!secret) return NextResponse.json({ error: "Payment webhook is unavailable." }, { status: 503 });
  let event: Stripe.Event;
  try { event = getStripe().webhooks.constructEvent(await req.text(), signature, secret); }
  catch { return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 }); }
  try {
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (intent.metadata?.painting_ids) await finalizePayment(intent);
    } else if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.painting_ids && session.payment_status === "paid") await finalizeSession(session);
    } else if (event.type === "payment_intent.canceled" || event.type === "checkout.session.expired") {
      const object = event.data.object as Stripe.PaymentIntent | Stripe.Checkout.Session;
      const id = object.metadata?.reservation_id;
      if (id) {
        const reservation = await getReservation(id);
        if (reservation) await cancelReservation(reservation);
      }
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    // A non-2xx tells Stripe to retry. Order+inventory writes are a single
    // idempotent database transaction, so retries never create another sale.
    console.error("[webhook:fulfillment]", event.id, err instanceof Error ? err.message : "Fulfillment error");
    return NextResponse.json({ error: "Payment fulfillment needs a retry." }, { status: 500 });
  }
}
