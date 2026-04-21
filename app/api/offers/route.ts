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

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      painting_id,
      amount,
      name,
      email,
      phone,
      message,
    } = body as Record<string, string | number | undefined>;

    if (
      !painting_id ||
      typeof amount !== "number" ||
      amount < 1 ||
      !name ||
      !email
    ) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 },
      );
    }

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

    // 1) Persist the offer
    let token: string | null = null;
    try {
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
      token = data?.token ?? null;
    } catch (err) {
      // Don't block the user if DB write fails — still email Robert.
      console.error("[api/offers] DB insert failed:", err);
    }

    // 2) Email Robert (if configured)
    const to = process.env.CONTACT_EMAIL;
    const key = process.env.RESEND_API_KEY;
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get("origin") ||
      "https://robertmorrow.art";

    if (key && to && token) {
      const actions = ["accept", "counter", "decline"] as const;
      const actionLinks = actions
        .map((a) => {
          const url = `${siteUrl}/admin/offers/${token}?action=${a}`;
          const label = a[0].toUpperCase() + a.slice(1);
          return `<a href="${url}" style="display:inline-block;padding:12px 20px;margin-right:8px;background:#1C1915;color:#F7F4EE;text-decoration:none;font-family:sans-serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">${label}</a>`;
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

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          from: "Robert Morrow Art <offers@robertmorrow.art>",
          to: [to],
          reply_to: String(email),
          subject: `Offer — ${painting.title} · $${amount}`,
          html,
        }),
      });
      if (!res.ok) {
        console.error("[api/offers] Resend error:", await res.text());
      }
    } else {
      console.log("[api/offers] (no RESEND_API_KEY — would email Robert)", {
        painting: painting.title,
        amount,
        name,
        email,
        phone,
        message,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
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
