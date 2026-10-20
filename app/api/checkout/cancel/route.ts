import { NextResponse } from "next/server";
import { getReservation, cancelReservation } from "@/lib/inventory";
import { CheckoutError } from "@/lib/checkout-validation";
import { isSameOrigin, forbiddenOriginResponse, rateLimit, rateLimitResponse } from "@/lib/security";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) return forbiddenOriginResponse();
    const limit = rateLimit(req, "checkout-cancel", 30, 10 * 60 * 1000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new CheckoutError("A checkout reference is required.");
    if (typeof body.reservationId !== "string") return NextResponse.json({ error: "A checkout reference is required." }, { status: 400 });
    const reservation = await getReservation(body.reservationId);
    if (!reservation) return NextResponse.json({ status: "released" });
    // Offer checkout links are controlled by the Studio and automatic expiry.
    if (reservation.kind !== "cart") return NextResponse.json({ error: "This checkout cannot be canceled here." }, { status: 400 });
    return NextResponse.json(await cancelReservation(reservation), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SyntaxError) return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
    console.error("[checkout/cancel]", err instanceof Error ? err.message : "Cancellation error");
    return NextResponse.json({ error: "We couldn’t confirm cancellation. Your painting remains held while we check payment." }, { status: err instanceof CheckoutError ? err.status : 503 });
  }
}
