// =======================================================================
// POST /api/offers — records a buyer's offer and emails Robert.
//
// Body: { painting_id, amount, name, email, phone?, message? }
// Side effects:
//   1. Inserts into `offers` table (RLS bypassed via service role).
//   2. Emails Robert with Accept / Counter / Decline links (if RESEND_API_KEY
//      and CONTACT_EMAIL are configured).
// =======================================================================

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPainting } from "@/lib/paintings";
import { forbiddenOriginResponse, isSameOrigin, rateLimit, rateLimitResponse } from "@/lib/security";
import { InputError, readFormJson, validateOffer } from "@/lib/admin-validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) return forbiddenOriginResponse();
    const limit = rateLimit(req, "offers", 8, 10 * 60 * 1000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);

    const {
      painting_id,
      amount,
      name,
      email,
      phone,
      message,
    } = validateOffer(await readFormJson(req));

    const painting = await getPainting(String(painting_id));
    if (!painting) {
      return NextResponse.json(
        { error: "Painting not found." },
        { status: 404 },
      );
    }
    if (painting.status !== "available") {
      return NextResponse.json(
        { error: "This painting is no longer available." },
        { status: 409 },
      );
    }

    // 1) Persist the offer. Never acknowledge an offer that was not saved.
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("offers")
        .insert({
          painting_id: painting.id,
          amount,
          name: String(name),
          email: String(email),
          phone: phone ? String(phone) : null,
          message: message ? String(message) : null,
        })
        .select("token")
        .single();
    if (error) throw error;
    const token = data?.token;
    if (!token) throw new Error("Offer insert did not return a token.");

    // 2) Email Robert (if configured)
    const to = process.env.CONTACT_EMAIL;
    const key = process.env.RESEND_API_KEY;
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://www.robertmorrow.art";

    let notificationSent = false;

    if (key && to && token) {
      const actions = ["accept", "counter", "decline"] as const;
      const actionLinks = actions
        .map((a) => {
          const url = new URL(`/admin/offers/${token}?action=${a}`, siteUrl).toString();
          const label = a[0].toUpperCase() + a.slice(1);
          return `<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;margin-right:8px;background:#1C1915;color:#F7F4EE;text-decoration:none;font-family:sans-serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">${label}</a>`;
        })
        .join("");

      const html = `
        <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1C1915;">
          <p style="font-family:sans-serif;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#6B6557;margin:0 0 16px;">New offer</p>
          <h1 style="font-size:28px;font-weight:400;margin:0 0 4px;"><em>${escapeHtml(painting.title)}</em></h1>
          <div style="color:#6B6557;font-size:14px;">${painting.w}″ × ${painting.h}″ · listed at $${painting.price}</div>

          <div style="margin:28px 0;padding:20px;background:#EFEBE2;">
            <div style="font-family:sans-serif;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#6B6557;margin-bottom:6px;">Offer</div>
            <div style="font-size:32px;">$${amount}</div>
          </div>

          <p style="margin:0 0 4px;"><strong>${escapeHtml(String(name))}</strong></p>
          <p style="margin:0 0 4px;"><a href="mailto:${escapeHtml(String(email))}">${escapeHtml(String(email))}</a>${phone ? ` · ${escapeHtml(String(phone))}` : ""}</p>
          ${message ? `<blockquote style="margin:20px 0;padding:0 0 0 16px;border-left:1px solid rgba(28,25,21,0.2);color:#3A352C;font-style:italic;">${escapeHtml(String(message)).replace(/\n/g, "<br>")}</blockquote>` : ""}

          <div style="margin-top:28px;">${actionLinks}</div>

          <p style="font-size:11px;color:#9C9585;margin-top:32px;">
            These links open a page where you can confirm the action. Accepting
            sends ${escapeHtml(String(name))} a secure payment link for $${amount}.
          </p>
        </div>
      `;

      try {
        const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          from: "Robert Morrow Art <robertmorrow@goodbusinesshq.com>",
          to: [to],
          reply_to: String(email),
          subject: `Offer — ${painting.title} · $${amount}`,
          html,
        }),
      });
      if (!res.ok) {
        console.error("[api/offers] Resend error:", await res.text());
      }
      notificationSent = res.ok;
      } catch (error) {
        console.error("[api/offers] Email delivery failed.", error instanceof Error ? error.name : "Unknown error");
      }
    } else {
      console.error("[api/offers] Offer saved, but email delivery is not configured.");
    }

    return NextResponse.json({ ok: true, notificationSent });
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[api/offers]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
