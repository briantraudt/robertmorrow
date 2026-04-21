// =======================================================================
// Admin auth — single shared password, HMAC-signed cookie.
//
// Flow:
//   1. User POSTs to /api/admin/login with { password }.
//   2. If password matches ADMIN_PASSWORD, we set an HTTP-only cookie
//      whose value is HMAC(secret, "admin"). The secret is ADMIN_SESSION_SECRET.
//   3. On each protected request, isAdmin() recomputes the expected HMAC and
//      constant-time compares with the cookie. If equal, user is admin.
//
// Why not just store the password in the cookie? The cookie is stolen =
// password stolen. HMAC lets us rotate ADMIN_SESSION_SECRET to invalidate
// all sessions without changing the password.
// =======================================================================

import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const ADMIN_COOKIE = "admin_session";
// 30 days
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function getExpectedToken(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update("admin").digest("hex");
}

export function isAdmin(): boolean {
  const expected = getExpectedToken();
  if (!expected) return false;
  const val = cookies().get(ADMIN_COOKIE)?.value;
  if (!val) return false;
  try {
    const a = Buffer.from(val, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function requireAdmin() {
  if (!isAdmin()) redirect("/admin/login");
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(password, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
