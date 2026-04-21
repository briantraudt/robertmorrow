// =======================================================================
// POST /api/admin/login — { password } → sets admin_session cookie
// =======================================================================

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  getExpectedToken,
  verifyPassword,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const password = String(body?.password ?? "");
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
    cookies().set(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_COOKIE_MAX_AGE,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/login]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
