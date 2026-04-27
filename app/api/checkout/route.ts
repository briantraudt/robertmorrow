// =======================================================================
// POST /api/checkout
// Creates a Stripe PaymentIntent for the items in the buyer's cart.
// Body: { items: [{ id, slug }], email, name, address }
// Response: { clientSecret }
// =======================================================================

import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getPainting } from "@/lib/paintings";
import { rateLimit, rateLimitResponse } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const limit = rateLimit(req, "checkout", 20, 10 * 60 * 1000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);

    const body = await req.json();
    const itemRefs: { id?: string; slug?: string }[] = body.items ?? [];
    const email: string | undefined = body.email;
    const name: string | undefined = body.name;
    const address = body.address as
      | {
          line1?: string;
          line2?: string;
          city?: string;
          state?: string;
          postal_code?: string;
          country?: string;
        }
      | undefined;

    if (!itemRefs.length) {
      return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
    }
    if (itemRefs.length > 10) {
      return NextResponse.json({ error: "Cart has too many items." }, { status: 400 });
    }

    // Validate and price every item server-side (never trust client prices).
    const resolved = [];
    for (const ref of itemRefs) {
      const key = ref.id || ref.slug;
      if (!key) continue;
      const p = await getPainting(key);
      if (!p) {
        return NextResponse.json(
          { error: `Painting ${key} not found.` },
          { status: 400 },
        );
      }
      if (p.status !== "available") {
        return NextResponse.json(
          { error: `"${p.title}" is no longer available.` },
          { status: 400 },
        );
      }
      if (p.price <= 0) {
        return NextResponse.json(
          { error: `"${p.title}" is not priced for online checkout yet.` },
          { status: 400 },
        );
      }
      resolved.push(p);
    }

    const stripe = getStripe();
    const subtotal = resolved.reduce((sum, p) => sum + p.price, 0);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: subtotal * 100,
      currency: "usd",
      receipt_email: email,
      payment_method_types: ["card"],
      description:
        resolved.length === 1
          ? `${resolved[0].title} by Robert Morrow`
          : `${resolved.length} paintings by Robert Morrow`,
      metadata: {
        painting_ids: resolved.map((p) => p.id).join(","),
        painting_slugs: resolved.map((p) => p.slug).join(","),
        buyer_name: name ?? "",
      },
      shipping:
        name && address
          ? {
              name,
              address: {
                line1: address.line1 ?? "",
                line2: address.line2 || undefined,
                city: address.city ?? "",
                state: address.state ?? "",
                postal_code: address.postal_code ?? "",
                country: address.country ?? "US",
              },
            }
          : undefined,
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      total: subtotal,
    });
  } catch (err: unknown) {
    console.error("[api/checkout]", err);
    const message = err instanceof Error ? err.message : "Checkout failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
