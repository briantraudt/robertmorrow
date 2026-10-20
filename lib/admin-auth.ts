// =======================================================================
// Admin auth — single shared password, HMAC-signed cookie.
//
// Flow:
//   1. User POSTs to /api/admin/login with { password }.
//   2. If password matches ADMIN_PASSWORD, we set an HTTP-only cookie
//      with a signed expiry and random nonce. The secret is ADMIN_SESSION_SECRET.
//   3. On each protected request, isAdmin() verifies both the signature and
//      expiry. Browser cookie settings alone do not enforce session expiry.
//
// Why not just store the password in the cookie? The cookie is stolen =
// password stolen. HMAC lets us rotate ADMIN_SESSION_SECRET to invalidate
// all sessions without changing the password.
// =======================================================================

import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_MAX_AGE, adminReturnPath, createAdminSession, verifyAdminSession } from "./admin-session";

export const ADMIN_COOKIE = "admin_session";
// 30 days
export const ADMIN_COOKIE_MAX_AGE = ADMIN_SESSION_MAX_AGE;

export function getExpectedToken(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  return createAdminSession(secret);
}

export async function isAdmin(): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const val = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!val) return false;
  try {
    return verifyAdminSession(val, secret);
  } catch {
    return false;
  }
}

export async function requireAdmin(returnTo = "/admin") {
  if (!(await isAdmin())) redirect(`/admin/login?next=${encodeURIComponent(adminReturnPath(returnTo))}`);
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(password, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
