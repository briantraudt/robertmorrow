import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPaintings } from "@/lib/paintings";
import { isSameOrigin, forbiddenOriginResponse, rateLimit, rateLimitResponse } from "@/lib/security";
import { CheckoutError, validateCheckoutBody } from "@/lib/checkout-validation";
import { reserveInventory, ensureCartPayment, cancelReservation, reconcileExpiredInventory } from "@/lib/inventory";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) return forbiddenOriginResponse();
    const limit = rateLimit(req, "checkout", 20, 10 * 60 * 1000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);
    const input = validateCheckoutBody(await req.json());
    if (process.env.INVENTORY_CHECKOUT_ENABLED !== "true") return NextResponse.json({ error: "Online checkout is briefly unavailable while inventory is verified. Please try again soon." }, { status: 503 });
    await reconcileExpiredInventory(input.ids);
    const reservation = await reserveInventory(input.reservationId ?? randomUUID(), input.ids, input.buyer);
    if (reservation.status === "paid" || reservation.status === "released") throw new CheckoutError("This checkout has finished. Please review your cart.", 409);
    if (Date.parse(reservation.expires_at) <= Date.now()) {
      await cancelReservation(reservation);
      throw new CheckoutError("Your checkout hold has expired. Please start again.", 409);
    }
    const intent = await ensureCartPayment(reservation);
    if (!["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) throw new CheckoutError("This payment is already being processed or has finished. Please check its status.", 409);
    const catalog = await getPaintings();
    const items = reservation.items.map((item) => {
      const painting = catalog.find((p) => p.id === item.id);
      if (!painting) throw new Error("Reserved painting could not be loaded.");
      return { ...painting, price: item.unit_amount / 100 };
    });
    return NextResponse.json({ clientSecret: intent.client_secret, reservationId: reservation.id, total: reservation.amount_total / 100, expiresAt: reservation.expires_at, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SyntaxError) return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
    if (err instanceof CheckoutError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[api/checkout]", err instanceof Error ? err.message : "Checkout error");
    return NextResponse.json({ error: "We couldn’t prepare payment. Please try again; your checkout reference has been kept." }, { status: 503 });
  }
}
