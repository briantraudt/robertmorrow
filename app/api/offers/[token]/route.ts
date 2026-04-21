// =======================================================================
// POST /api/offers/[token]  — Robert's action endpoint.
// Body: { action: "accept" | "counter" | "decline", counter?: number }
//
// Guarded by the token (unguessable UUID in the offers table).
// =======================================================================

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { getPainting } from "@/lib/paintings";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { token: string } },
) {
  try {
    const body = await req.json();
    const action = String(body.action ?? "");
    if (!["accept", "counter", "decline"].includes(action)) {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: offer, error } = await supabase
      .from("offers")
      .select("*")
      .eq("token", params.token)
      .maybeSingle();
    if (error || !offer) {
      return NextResponse.json({ error: "Offer not found." }, { status: 404 });
    }
    if (["accepted", "declined", "withdrawn"].includes(offer.status)) {
      return NextResponse.json(
        { error: `Offer already ${offer.status}.` },
        { status: 409 },
      );
    }

    const painting = await getPainting(offer.painting_id);
    if (!painting) {
      return NextResponse.json({ error: "Painting missing." }, { status: 404 });
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get("origin") ||
      "https://robertmorrow.art";
    const resendKey = process.env.RESEND_API_KEY;

    if (action === "accept") {
      // Mark offer accepted, reserve the painting, create Stripe Payment Link.
      const stripe = getStripe();

      // Create a one-off product + price and a Payment Link for this offer.
      const product = await stripe.products.create({
        name: `${painting.title} (${painting.year}) — accepted offer`,
        metadata: { painting_id: painting.id, offer_id: offer.id },
      });
      const price = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: offer.amount * 100,
      });
      const link = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        shipping_address_collection: { allowed_countries: ["US", "CA"] },
        after_completion: {
          type: "redirect",
          redirect: { url: `${siteUrl}/checkout/success` },
        },
        metadata: { painting_ids: painting.id, offer_id: offer.id },
      });

      await supabase
        .from("offers")
        .update({ status: "accepted", internal_note: link.url })
        .eq("id", offer.id);

      await supabase
        .from("paintings")
        .update({ status: "reserved" })
        .eq("id", painting.id);

      await sendEmail(
        resendKey,
        offer.email,
        `Your offer on "${painting.title}" has been accepted`,
        acceptedEmailHtml(painting, offer, link.url),
      );

      return NextResponse.json({
        ok: true,
        message: `Accepted. Payment link sent to ${offer.email}.`,
      });
    }

    if (action === "counter") {
      const counter = Number(body.counter);
      if (!counter || counter < 1) {
        return NextResponse.json({ error: "Invalid counter amount." }, { status: 400 });
      }

      await supabase
        .from("offers")
        .update({ status: "countered", counter })
        .eq("id", offer.id);

      await sendEmail(
        resendKey,
        offer.email,
        `A counter-offer on "${painting.title}"`,
        counterEmailHtml(painting, offer, counter, siteUrl),
      );

      return NextResponse.json({
        ok: true,
        message: `Counter of $${counter} sent to ${offer.email}.`,
      });
    }

    // decline
    await supabase
      .from("offers")
      .update({ status: "declined" })
      .eq("id", offer.id);

    await sendEmail(
      resendKey,
      offer.email,
      `Your offer on "${painting.title}"`,
      declinedEmailHtml(painting, offer),
    );

    return NextResponse.json({
      ok: true,
      message: `Declined. Note sent to ${offer.email}.`,
    });
  } catch (err) {
    console.error("[api/offers/[token]]", err);
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------- email helpers ------------------------------------------------

async function sendEmail(key: string | undefined, to: string, subject: string, html: string) {
  if (!key) {
    console.log(`[offers] (no RESEND_API_KEY — would email ${to})`, { subject });
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: "Robert Morrow <robert@robertmorrow.art>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) console.error("[offers] Resend error:", await res.text());
}

type OfferEmailRow = {
  name: string;
  email: string;
  amount: number;
  message: string | null;
};

function acceptedEmailHtml(
  painting: { title: string; w: number; h: number },
  offer: OfferEmailRow,
  paymentUrl: string,
) {
  return `
    <div style="font-family:Georgia,serif;max-width:540px;margin:0 auto;padding:24px;color:#1C1915;">
      <h1 style="font-size:24px;font-weight:400;">Dear ${escapeHtml(offer.name)},</h1>
      <p>Thank you for your offer on <em>${escapeHtml(painting.title)}</em>.</p>
      <p>I've accepted your offer of <strong>$${offer.amount}</strong>. You can complete payment securely at the link below — the painting is held for you while you do.</p>
      <p style="margin:24px 0;"><a href="${paymentUrl}" style="display:inline-block;padding:14px 24px;background:#1C1915;color:#F7F4EE;text-decoration:none;font-family:sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;">Complete payment · $${offer.amount}</a></p>
      <p>Once paid, I'll pack it carefully and ship within five business days.</p>
      <p style="margin-top:32px;">— Robert</p>
    </div>
  `;
}

function counterEmailHtml(
  painting: { title: string },
  offer: OfferEmailRow,
  counter: number,
  siteUrl: string,
) {
  return `
    <div style="font-family:Georgia,serif;max-width:540px;margin:0 auto;padding:24px;color:#1C1915;">
      <h1 style="font-size:24px;font-weight:400;">Dear ${escapeHtml(offer.name)},</h1>
      <p>Thank you for your offer on <em>${escapeHtml(painting.title)}</em>.</p>
      <p>Would you consider <strong>$${counter}</strong>? If that works for you, write back and I'll send a secure payment link.</p>
      <p>Otherwise the painting is still <a href="${siteUrl}">listed here</a>.</p>
      <p style="margin-top:32px;">— Robert</p>
    </div>
  `;
}

function declinedEmailHtml(painting: { title: string }, offer: OfferEmailRow) {
  return `
    <div style="font-family:Georgia,serif;max-width:540px;margin:0 auto;padding:24px;color:#1C1915;">
      <h1 style="font-size:24px;font-weight:400;">Dear ${escapeHtml(offer.name)},</h1>
      <p>Thank you for your offer on <em>${escapeHtml(painting.title)}</em>. I'm afraid I won't be able to accept it this time.</p>
      <p>Please feel welcome to make another offer, or reach out about a different piece.</p>
      <p style="margin-top:32px;">— Robert</p>
    </div>
  `;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
