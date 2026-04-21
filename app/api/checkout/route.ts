// =======================================================================
// POST /api/checkout
// Creates a Stripe Checkout Session for the items in the buyer's cart.
// Body: { items: [{ id, slug }], email, name, address }
// Response: { url }
// =======================================================================

import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getPainting } from "@/lib/paintings";

export const runtime = "nodejs";

const DELIVERY_FLAT_USD = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const itemRefs: { id?: string; slug?: string }[] = body.items ?? [];
    const email: string | undefined = body.email;
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get("origin") ||
      "http://localhost:3000";

    if (!itemRefs.length) {
      return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
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
      resolved.push(p);
    }

    const stripe = getStripe();
    const lineItems = resolved.map((p) => ({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: p.price * 100,
        product_data: {
          name: `${p.title} (${p.year})`,
          description: `${p.medium}, ${p.w}″ × ${p.h}″`,
          metadata: { painting_id: p.id, slug: p.slug },
        },
      },
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: email,
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout`,
      shipping_address_collection: { allowed_countries: ["US", "CA"] },
      shipping_options: [
        {
          shipping_rate_data: {
            display_name: "Free delivery",
            type: "fixed_amount",
            fixed_amount: { amount: DELIVERY_FLAT_USD * 100, currency: "usd" },
            delivery_estimate: {
              minimum: { unit: "business_day", value: 5 },
              maximum: { unit: "business_day", value: 10 },
            },
          },
        },
      ],
      automatic_tax: { enabled: false }, // enable once Stripe Tax is configured
      metadata: {
        painting_ids: resolved.map((p) => p.id).join(","),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error("[api/checkout]", err);
    const message = err instanceof Error ? err.message : "Checkout failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
