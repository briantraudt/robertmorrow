// =======================================================================
// POST /api/contact — receives messages from the contact form.
//
// Success means the email provider accepted the message for delivery.
// =======================================================================

import { NextResponse } from "next/server";
import { forbiddenOriginResponse, isSameOrigin, rateLimit, rateLimitResponse } from "@/lib/security";
import { InputError, readFormJson, validateContact } from "@/lib/admin-validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) return forbiddenOriginResponse();
    const limit = rateLimit(req, "contact", 5, 10 * 60 * 1000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);

    const { name, email, subject, message } = validateContact(await readFormJson(req));

    const to = process.env.CONTACT_EMAIL;
    const key = process.env.RESEND_API_KEY;

    if (key && to) {
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
          reply_to: email,
          subject: `[website] ${subject ?? "Contact"} — ${name}`,
          text: `From: ${name} <${email}>\nSubject: ${subject}\n\n${message}`,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        console.error("[api/contact] Resend error:", txt);
        return NextResponse.json(
          { error: "Could not send message right now." },
          { status: 502 },
        );
      }
    } else {
      console.error("[api/contact] Email delivery is not configured.");
      return NextResponse.json({ error: "Messages are temporarily unavailable. Please try again later." }, { status: 503 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[api/contact]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
