import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";
import { getPainting } from "@/lib/paintings";
import { siteUrl } from "@/lib/seo";
import { CheckoutError, UUID_PATTERN } from "@/lib/checkout-validation";
import { reserveInventory, ensureOfferSession, reconcileExpiredInventory, type Reservation } from "@/lib/inventory";
import { forbiddenOriginResponse, isSameOrigin, rateLimit, rateLimitResponse } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (!isSameOrigin(req)) return forbiddenOriginResponse();
    if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const limit = rateLimit(req, "offer-actions", 20, 10 * 60 * 1000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);
    const { token } = await params;
    if (!UUID_PATTERN.test(token)) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
    const body = await req.json();
    if (!body || !["accept", "counter", "decline"].includes(body.action)) return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    const supabase = createServerSupabaseClient();
    const { data: offer, error } = await supabase.from("offers").select("*").eq("token", token).maybeSingle();
    if (error) throw error;
    if (!offer) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
    if (["declined", "withdrawn"].includes(offer.status)) return NextResponse.json({ error: `Offer already ${offer.status}.` }, { status: 409 });
    const painting = await getPainting(offer.painting_id);
    if (!painting) return NextResponse.json({ error: "Painting not found." }, { status: 404 });
    if (body.action === "accept") {
      if (process.env.INVENTORY_CHECKOUT_ENABLED !== "true") return NextResponse.json({ error: "Checkout is temporarily unavailable while inventory is verified. Please try again soon." }, { status: 503 });
      await reconcileExpiredInventory([painting.id]);
      const existing = await supabase.from("inventory_reservations").select("*").eq("offer_id", offer.id).in("status", ["pending", "active"]).maybeSingle();
      if (existing.error) throw existing.error;
      const reservation = (existing.data as Reservation | null) ?? await reserveInventory(randomUUID(), [painting.id], { email: offer.email, name: offer.name }, offer.id);
      const session = await ensureOfferSession(reservation);
      if (!session.url || session.status !== "open") return NextResponse.json({ error: "This offer checkout has expired or finished. Please refresh." }, { status: 409 });
      const saved = await supabase.from("offers").update({ internal_note: session.url }).eq("id", offer.id).eq("status", "accepted");
      if (saved.error) throw saved.error;
      const notified = await sendEmail(offer.email, `Your offer on "${painting.title}" has been accepted`, acceptedEmailHtml(painting, offer, session.url), `offer-accepted-${reservation.id}`);
      return NextResponse.json({ ok: true, notificationSent: notified, paymentUrl: session.url, message: notified ? `Accepted. A single-use checkout link has been sent to ${offer.email}.` : "Accepted and reserved for 24 hours. Email could not be delivered; the checkout link is saved below." });
    }
    if (offer.status === "accepted") return NextResponse.json({ error: "This painting is already held for an accepted offer." }, { status: 409 });
    if (body.action === "counter") {
      const counter = Number(body.counter);
      if (!Number.isSafeInteger(counter) || counter < 1 || counter > 999999) return NextResponse.json({ error: "Enter a whole-dollar counter amount between $1 and $999,999." }, { status: 400 });
      const changed = await supabase.from("offers").update({ status: "countered", counter }).eq("id", offer.id).eq("status", offer.status).select("id").maybeSingle();
      if (changed.error) throw changed.error;
      if (!changed.data) return NextResponse.json({ error: "This offer changed. Please refresh." }, { status: 409 });
      const notified = await sendEmail(offer.email, `A counter-offer on "${painting.title}"`, counterEmailHtml(painting, offer, counter, siteUrl), `offer-counter-${offer.id}-${counter}`);
      return NextResponse.json({ ok: true, notificationSent: notified, message: notified ? `Counter of $${counter} sent to ${offer.email}.` : `Counter of $${counter} saved. Email could not be delivered; please contact the buyer.` });
    }
    const changed = await supabase.from("offers").update({ status: "declined" }).eq("id", offer.id).eq("status", offer.status).select("id").maybeSingle();
    if (changed.error) throw changed.error;
    if (!changed.data) return NextResponse.json({ error: "This offer changed. Please refresh." }, { status: 409 });
    const notified = await sendEmail(offer.email, `Your offer on "${painting.title}"`, declinedEmailHtml(painting, offer), `offer-declined-${offer.id}`);
    return NextResponse.json({ ok: true, notificationSent: notified, message: notified ? `Declined. Note sent to ${offer.email}.` : "Declined and saved. Email could not be delivered; please contact the buyer." });
  } catch (err) {
    console.error("[offer-action]", err instanceof Error ? err.message : "Offer action failed");
    return NextResponse.json({ error: err instanceof CheckoutError ? err.message : "This action could not be completed. Please refresh and try again." }, { status: err instanceof CheckoutError ? err.status : err instanceof SyntaxError ? 400 : 503 });
  }
}

async function sendEmail(to: string, subject: string, html: string, idempotencyKey: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from: "Robert Morrow <robertmorrow@goodbusinesshq.com>", to: [to], subject, html }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.error("[offer-email] Provider rejected delivery", res.status);
    return res.ok;
  } catch { console.error("[offer-email] Delivery could not be confirmed"); return false; }
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
      <p>I've accepted your offer of <strong>$${offer.amount}</strong>. You can complete payment securely at the link below — the painting is held for you for 24 hours. This checkout link can be used once.</p>
      <p style="margin:24px 0;"><a href="${paymentUrl}" style="display:inline-block;padding:14px 24px;background:#1C1915;color:#F7F4EE;text-decoration:none;font-family:sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;">Complete payment · $${offer.amount}</a></p>
      <p>Once paid, I'll contact you to confirm delivery details.</p>
      <p style="margin-top:32px;">— Robert</p>
    </div>
  `;
}

function counterEmailHtml(
  painting: { title: string; slug: string },
  offer: OfferEmailRow,
  counter: number,
  siteUrl: string,
) {
  return `
    <div style="font-family:Georgia,serif;max-width:540px;margin:0 auto;padding:24px;color:#1C1915;">
      <h1 style="font-size:24px;font-weight:400;">Dear ${escapeHtml(offer.name)},</h1>
      <p>Thank you for your offer on <em>${escapeHtml(painting.title)}</em>.</p>
      <p>Would you consider <strong>$${counter}</strong>? If that works for you, please <a href="${siteUrl}/paintings/${encodeURIComponent(painting.slug)}">submit a new offer of $${counter} on the painting page</a>. Once I accept that offer, you'll receive a secure payment link for the agreed amount.</p>
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
