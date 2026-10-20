import "server-only";
import type Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "./supabase/server";
import { getStripe } from "./stripe";
import { CheckoutError, PAINTING_ID_PATTERN, UUID_PATTERN } from "./checkout-validation";
import { siteUrl } from "./seo";

export type Reservation = {
  id: string;
  status: "pending" | "active" | "paid" | "released";
  kind: "cart" | "offer";
  painting_ids: string[];
  items: { id: string; slug: string; title: string; unit_amount: number }[];
  amount_total: number;
  buyer: { email: string; name: string; address?: Stripe.AddressParam };
  offer_id: string | null;
  stripe_payment_intent: string | null;
  stripe_session_id: string | null;
  expires_at: string;
  created_at: string;
};
export type PurchaseState = { status: "paid" | "pending" | "processing" | "released"; paintingIds?: string[]; orderRef?: string };

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await createServerSupabaseClient().rpc(name, args);
  if (error) {
    console.error(`[inventory:${name}]`, { code: error.code, message: error.message });
    if (error.code === "P0001" || error.code === "23505") throw new CheckoutError("One or more paintings are no longer available, or this checkout has changed. Please review your cart.", 409);
    throw new Error("Inventory could not be updated. Please try again.", { cause: error });
  }
  return data as T;
}

export async function getReservation(id: string): Promise<Reservation | null> {
  if (!UUID_PATTERN.test(id)) throw new CheckoutError("Invalid checkout reference.");
  const { data, error } = await createServerSupabaseClient().from("inventory_reservations").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Checkout could not be loaded.", { cause: error });
  return data as Reservation | null;
}

export async function reserveInventory(id: string, paintingIds: string[], buyer: Reservation["buyer"], offerId: string | null = null): Promise<Reservation> {
  return rpc("reserve_inventory", { p_reservation_id: id, p_painting_ids: paintingIds, p_buyer: buyer, p_offer_id: offerId });
}

function refreshCatalog(reservation?: Reservation) {
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin");
  if (reservation) for (const item of reservation.items) revalidatePath(`/paintings/${item.slug}`);
}

export async function bindPayment(reservation: Reservation, paymentIntent: string | null, sessionId: string | null = null): Promise<Reservation> {
  const bound = await rpc<Reservation>("bind_inventory_payment", { p_reservation_id: reservation.id, p_payment_intent: paymentIntent, p_session_id: sessionId });
  refreshCatalog(bound);
  return bound;
}

function intentParams(r: Reservation): Stripe.PaymentIntentCreateParams {
  return {
    amount: r.amount_total, currency: "usd", receipt_email: r.buyer.email,
    payment_method_types: ["card"],
    description: r.items.length === 1 ? `${r.items[0].title} by Robert Morrow` : `${r.items.length} paintings by Robert Morrow`,
    metadata: { reservation_id: r.id, painting_ids: r.painting_ids.join(","), buyer_name: r.buyer.name },
    ...(r.buyer.address ? { shipping: { name: r.buyer.name, address: r.buyer.address } } : {}),
  };
}

// The immutable database snapshot recreates exactly the same Stripe request if
// a timeout happens after Stripe creates a payment but before its ID is stored.
export async function ensureCartPayment(r: Reservation): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  if (r.stripe_payment_intent) return stripe.paymentIntents.retrieve(r.stripe_payment_intent);
  if (r.kind !== "cart" || r.status === "released" || r.status === "paid") throw new CheckoutError("This checkout is no longer active.", 409);
  if (Date.now() - Date.parse(r.created_at) > 23 * 60 * 60 * 1000) throw new Error("Unresolved payment creation requires reconciliation before inventory can be released.");
  const intent = await stripe.paymentIntents.create(intentParams(r), { idempotencyKey: `rm-cart-${r.id}` });
  await bindPayment(r, intent.id);
  return intent;
}

function sessionParams(r: Reservation): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment", payment_method_types: ["card"], customer_email: r.buyer.email,
    expires_at: Math.floor(Date.parse(r.expires_at) / 1000),
    line_items: r.items.map((item) => ({ quantity: 1, price_data: { currency: "usd", unit_amount: item.unit_amount, product_data: { name: `${item.title} — accepted offer` } } })),
    metadata: { reservation_id: r.id, painting_ids: r.painting_ids.join(","), offer_id: r.offer_id ?? "" },
    payment_intent_data: { metadata: { reservation_id: r.id, painting_ids: r.painting_ids.join(","), offer_id: r.offer_id ?? "" } },
    shipping_address_collection: { allowed_countries: ["US", "CA"] },
    success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/paintings/${encodeURIComponent(r.items[0].slug)}`,
  };
}

export async function ensureOfferSession(r: Reservation): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  if (r.stripe_session_id) return stripe.checkout.sessions.retrieve(r.stripe_session_id);
  if (r.kind !== "offer" || r.status === "released" || r.status === "paid") throw new CheckoutError("This offer checkout is no longer active.", 409);
  // Do not recreate after Stripe's idempotency-retention window.
  if (Date.now() - Date.parse(r.created_at) > 23 * 60 * 60 * 1000) throw new Error("Unresolved offer checkout requires reconciliation.");
  const session = await stripe.checkout.sessions.create(sessionParams(r), { idempotencyKey: `rm-offer-${r.id}` });
  await bindPayment(r, null, session.id);
  return session;
}

export function paintingIdsFromMetadata(metadata: Stripe.Metadata | null | undefined): string[] {
  const ids = (metadata?.painting_ids ?? "").split(",").filter(Boolean);
  if (!ids.length) return [];
  if (ids.length > 10 || new Set(ids).size !== ids.length || ids.some((id) => !PAINTING_ID_PATTERN.test(id))) throw new Error("Payment contains invalid painting references.");
  return ids.sort();
}

export async function finalizePayment(intent: Stripe.PaymentIntent, session?: Stripe.Checkout.Session): Promise<PurchaseState> {
  if (intent.status !== "succeeded") return { status: intent.status === "canceled" ? "released" : intent.status === "processing" ? "processing" : "pending" };
  const ids = paintingIdsFromMetadata(intent.metadata).length ? paintingIdsFromMetadata(intent.metadata) : paintingIdsFromMetadata(session?.metadata);
  if (!ids.length) throw new Error("Payment has no painting references.");
  const reservationId = intent.metadata.reservation_id || session?.metadata?.reservation_id || null;
  let reservation = reservationId ? await getReservation(reservationId) : null;
  if (reservation?.kind === "offer" && !session) {
    if (!reservation.stripe_session_id) throw new Error("Offer session has not yet been bound; retry fulfillment.");
    session = await getStripe().checkout.sessions.retrieve(reservation.stripe_session_id);
  }
  if (session) {
    const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (session.payment_status !== "paid" || pi !== intent.id || session.mode !== "payment") throw new Error("Checkout payment has not been verified.");
    if (reservation && session.metadata?.reservation_id !== reservation.id) throw new Error("Checkout reservation does not match payment.");
  }
  await rpc("finalize_inventory_sale", {
    p_payment_intent: intent.id, p_painting_ids: ids,
    p_amount_total: intent.amount_received, p_currency: intent.currency,
    p_email: intent.receipt_email ?? session?.customer_details?.email ?? session?.customer_email ?? null,
    p_name: intent.shipping?.name ?? session?.customer_details?.name ?? intent.metadata.buyer_name ?? null,
    p_shipping: intent.shipping ?? session?.shipping_details ?? null,
    p_reservation_id: reservationId, p_session_id: session?.id ?? null,
  });
  refreshCatalog(reservation ?? undefined);
  return { status: "paid", paintingIds: ids, orderRef: intent.id.slice(-10).toUpperCase() };
}

export async function finalizeSession(session: Stripe.Checkout.Session): Promise<PurchaseState> {
  if (session.status === "expired") return { status: "released" };
  if (session.payment_status !== "paid") return { status: session.status === "complete" ? "processing" : "pending" };
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!pi) throw new Error("Paid checkout is missing its payment reference.");
  return finalizePayment(await getStripe().paymentIntents.retrieve(pi), session);
}

async function release(r: Reservation): Promise<PurchaseState> {
  const result = await rpc<{ status: "released" | "paid" }>("release_inventory", { p_reservation_id: r.id });
  refreshCatalog(r);
  if (result.status === "paid") return { status: "paid", paintingIds: r.painting_ids, orderRef: r.stripe_payment_intent?.slice(-10).toUpperCase() };
  return { status: "released" };
}

export async function inspectReservation(r: Reservation): Promise<PurchaseState> {
  if (r.status === "paid") return { status: "paid", paintingIds: r.painting_ids, orderRef: r.stripe_payment_intent?.slice(-10).toUpperCase() };
  if (r.status === "released") return { status: "released" };
  if (r.kind === "offer") return finalizeSession(await ensureOfferSession(r));
  return finalizePayment(await ensureCartPayment(r));
}

// Expiry alone never frees a painting. A cancellation must be acknowledged by
// Stripe; if payment is processing or its status is uncertain, retain the hold.
export async function cancelReservation(r: Reservation): Promise<PurchaseState> {
  if (r.status === "paid" || r.status === "released") return inspectReservation(r);
  const stripe = getStripe();
  if (r.kind === "offer") {
    let session = await ensureOfferSession(r);
    if (session.payment_status === "paid" || session.status === "complete") return finalizeSession(session);
    if (session.status !== "expired") {
      try { session = await stripe.checkout.sessions.expire(session.id); }
      catch { session = await stripe.checkout.sessions.retrieve(session.id); }
    }
    if (session.status === "expired") return release(r);
    return finalizeSession(session);
  }
  let intent = await ensureCartPayment(r);
  if (intent.status === "succeeded") return finalizePayment(intent);
  if (intent.status === "processing") return { status: "processing" };
  if (intent.status !== "canceled") {
    try { intent = await stripe.paymentIntents.cancel(intent.id, { cancellation_reason: "abandoned" }, { idempotencyKey: `rm-cancel-${r.id}` }); }
    catch { intent = await stripe.paymentIntents.retrieve(intent.id); }
  }
  if (intent.status === "canceled") return release(r);
  return finalizePayment(intent);
}

export async function reconcileExpiredInventory(paintingIds?: string[]) {
  let query = createServerSupabaseClient().from("inventory_reservations").select("*")
    .in("status", ["pending", "active"]).lte("expires_at", new Date().toISOString()).order("expires_at").limit(25);
  if (paintingIds?.length) query = query.overlaps("painting_ids", paintingIds);
  const { data, error } = await query;
  if (error) throw new Error("Could not check expiring inventory.", { cause: error });
  const counts = { checked: 0, released: 0, paid: 0, retained: 0, errors: 0 };
  for (const row of data ?? []) {
    counts.checked++;
    try {
      const result = await cancelReservation(row as Reservation);
      if (result.status === "released") counts.released++;
      else if (result.status === "paid") counts.paid++;
      else counts.retained++;
    } catch (err) { counts.errors++; console.error("[inventory:reconcile]", row.id, err instanceof Error ? err.message : "Reconciliation failed"); }
  }
  return counts;
}
