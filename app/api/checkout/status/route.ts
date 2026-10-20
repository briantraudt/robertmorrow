import { NextResponse } from "next/server";
import { getReservation, inspectReservation, finalizeSession } from "@/lib/inventory";
import { getStripe } from "@/lib/stripe";
import { CheckoutError } from "@/lib/checkout-validation";
import { isSameOrigin, forbiddenOriginResponse, rateLimit, rateLimitResponse } from "@/lib/security";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) return forbiddenOriginResponse();
    const limit = rateLimit(req, "checkout-status", 90, 10 * 60 * 1000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new CheckoutError("A valid checkout reference is required.");
    let result;
    if (typeof body.reservationId === "string") {
      const reservation = await getReservation(body.reservationId);
      if (!reservation) return NextResponse.json({ error: "Checkout not found." }, { status: 404 });
      result = await inspectReservation(reservation);
    } else if (typeof body.sessionId === "string" && /^cs_(test_|live_)?[a-zA-Z0-9]{16,240}$/.test(body.sessionId)) {
      const session = await getStripe().checkout.sessions.retrieve(body.sessionId);
      if (!session.metadata?.painting_ids) return NextResponse.json({ error: "Checkout not found." }, { status: 404 });
      result = await finalizeSession(session);
    } else return NextResponse.json({ error: "A valid checkout reference is required." }, { status: 400 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SyntaxError) return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
    console.error("[checkout/status]", err instanceof Error ? err.message : "Status error");
    return NextResponse.json({ error: "We couldn’t confirm payment yet. Please try again." }, { status: err instanceof CheckoutError ? err.status : 503 });
  }
}
