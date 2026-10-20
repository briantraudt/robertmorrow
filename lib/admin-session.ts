import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export function createAdminSession(secret: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + ADMIN_SESSION_MAX_AGE;
  const payload = `v1.${expires}.${randomBytes(16).toString("hex")}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyAdminSession(token: string, secret: string, now = Date.now()): boolean {
  const match = /^v1\.(\d{10,12})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  const current = Math.floor(now / 1000);
  if (expires <= current || expires > current + ADMIN_SESSION_MAX_AGE) return false;
  const payload = `v1.${match[1]}.${match[2]}`;
  const expected = createHmac("sha256", secret).update(payload).digest();
  return timingSafeEqual(Buffer.from(match[3], "hex"), expected);
}

export function adminReturnPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 1000 || /[\\\r\n]/.test(value)) return "/admin";
  if (value !== "/admin" && !value.startsWith("/admin/")) return "/admin";
  try {
    const parsed = new URL(value, "https://admin.invalid");
    if (parsed.origin !== "https://admin.invalid" || (parsed.pathname !== "/admin" && !parsed.pathname.startsWith("/admin/"))) return "/admin";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/admin";
  }
}
