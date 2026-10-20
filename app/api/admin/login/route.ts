// =======================================================================
// POST /api/admin/login — { password } → sets admin_session cookie
// =======================================================================

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminReturnPath } from "@/lib/admin-session";
import { InputError, readFormJson } from "@/lib/admin-validation";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  getExpectedToken,
  verifyPassword,
} from "@/lib/admin-auth";
import {
  forbiddenOriginResponse,
  isSameOrigin,
  rateLimit,
  rateLimitResponse,
} from "@/lib/security";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) return forbiddenOriginResponse();
    const limit = rateLimit(req, "admin-login", 8, 10 * 60 * 1000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);

    const body = await readFormJson(req);
    if (typeof body.password !== "string" || !body.password || body.password.length > 1024) throw new InputError("Password is invalid.");
    const password = body.password;
    if (!verifyPassword(password)) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }
    const token = getExpectedToken();
    if (!token) {
      return NextResponse.json(
        { error: "Server is not configured for admin access." },
        { status: 500 },
      );
    }
    (await cookies()).set(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_COOKIE_MAX_AGE,
    });
    return NextResponse.json({ ok: true, redirect: adminReturnPath(body.returnTo) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[api/admin/login]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
