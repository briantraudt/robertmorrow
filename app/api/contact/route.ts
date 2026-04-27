// =======================================================================
// POST /api/contact — receives messages from the contact form.
//
// Two send paths, tried in order:
//   1. Resend (RESEND_API_KEY + CONTACT_EMAIL in env)  → sends real email
//   2. Fallback: log to server console and return ok   → useful in preview
// =======================================================================

import { NextResponse } from "next/server";
import { rateLimit, rateLimitResponse } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const limit = rateLimit(req, "contact", 5, 10 * 60 * 1000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);

    const body = await req.json();
    const { name, email, subject, message } = body as {
      name?: string;
      email?: string;
      subject?: string;
      message?: string;
    };

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email, and message are required." },
        { status: 400 },
      );
    }

    const to = process.env.CONTACT_EMAIL;
    const key = process.env.RESEND_API_KEY;

    if (key && to) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
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
      console.log("[api/contact] (stubbed — no RESEND_API_KEY set)", {
        name,
        email,
        subject,
        message,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/contact]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
