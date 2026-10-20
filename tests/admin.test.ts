import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_SESSION_MAX_AGE, adminReturnPath, createAdminSession, verifyAdminSession } from "../lib/admin-session";
import { InputError, readFormJson, safeStripeCheckoutUrl, validateContact, validateOffer, validatePainting } from "../lib/admin-validation";

const now = 1792500000000;
const secret = "test-only-admin-signing-secret";

test("admin sessions expire server-side and cannot be reused past the cookie deadline", () => {
  const token = createAdminSession(secret, now);
  assert.equal(verifyAdminSession(token, secret, now), true);
  assert.equal(verifyAdminSession(token, secret, now + ADMIN_SESSION_MAX_AGE * 1000 - 1), true);
  assert.equal(verifyAdminSession(token, secret, now + ADMIN_SESSION_MAX_AGE * 1000), false);
});

test("admin signatures reject tampering, legacy nonexpiring cookies and rotated secrets", () => {
  const token = createAdminSession(secret, now);
  const parts = token.split(".");
  parts[1] = String(Number(parts[1]) + 1000);
  assert.equal(verifyAdminSession(parts.join("."), secret, now), false);
  assert.equal(verifyAdminSession(token + "garbage", secret, now), false);
  assert.equal(verifyAdminSession("a".repeat(64), secret, now), false);
  assert.equal(verifyAdminSession(token, "different-secret", now), false);
  assert.notEqual(token, createAdminSession(secret, now));
});

test("admin sign-in preserves offer actions and prevents redirects outside Studio", () => {
  assert.equal(adminReturnPath("/admin/offers/123?action=accept"), "/admin/offers/123?action=accept");
  for (const path of ["https://attacker.example", "//attacker.example", "/admin/../../checkout", "/admin/../administrator", "/admin\\evil", null]) {
    assert.equal(adminReturnPath(path), "/admin");
  }
});

test("contact validation rejects missing messages, malformed emails and header injection", () => {
  const valid = { name: " Robert ", email: " art@example.com ", message: " A question. " };
  assert.deepEqual(validateContact(valid), { name: "Robert", email: "art@example.com", subject: "Contact", message: "A question." });
  for (const invalid of [{ ...valid, message: " " }, { ...valid, email: "not-an-email" }, { ...valid, name: "Robert\r\nBcc: attacker@example.com" }, { ...valid, subject: "Hello\nInjected" }, null, []]) {
    assert.throws(() => validateContact(invalid), InputError);
  }
});

test("offers require a valid painting, finite whole-dollar amount and buyer email", () => {
  const valid = { painting_id: "rm-painting-1", amount: 500, name: "Collector", email: "buyer@example.com" };
  assert.equal(validateOffer(valid).amount, 500);
  for (const amount of ["500", 0, -1, 500.5, Infinity, NaN, 1000000]) {
    assert.throws(() => validateOffer({ ...valid, amount }), InputError);
  }
  assert.throws(() => validateOffer({ ...valid, painting_id: "paint),status.eq.available" }), InputError);
  assert.throws(() => validateOffer({ ...valid, email: "bad@example" }), InputError);
});

test("painting edits reject invalid inventory values before database writes", () => {
  const painting = { title: "Morning", medium: "Acrylic", w: 24, h: 18, price: 0 };
  assert.equal(validatePainting(painting, true).fields.status, "available");
  assert.equal(validatePainting(painting, true).fields.price, 0);
  for (const patch of [{ w: -1 }, { h: 0 }, { price: -5 }, { price: "500" }, { w: 2.5 }, { title: " " }, { status: "paid" }, { series: "invalid" }]) {
    assert.throws(() => validatePainting(patch), InputError);
  }
});

test("painting image metadata only accepts the configured artwork storage origin", () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://art-test.supabase.co";
  try {
    assert.equal(validatePainting({ imageUrl: "https://art-test.supabase.co/storage/v1/object/public/paintings/painting.jpg", imageWidth: 1200 }).image?.width, 1200);
    for (const imageUrl of ["javascript:alert(1)", "https://attacker.example/image.jpg", "https://art-test.supabase.co/storage/v1/object/public/private-secret/image.jpg"]) {
      assert.throws(() => validatePainting({ imageUrl }), InputError);
    }
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  }
});

test("malformed and oversized JSON requests return input errors instead of server errors", async () => {
  assert.deepEqual(await readFormJson(new Request("https://site.example", { method: "POST", body: '{"name":"Robert"}' })), { name: "Robert" });
  await assert.rejects(readFormJson(new Request("https://site.example", { method: "POST", body: "{" })), InputError);
  await assert.rejects(readFormJson(new Request("https://site.example", { method: "POST", body: "[]" })), InputError);
  await assert.rejects(readFormJson(new Request("https://site.example", { method: "POST", body: JSON.stringify({ message: "x".repeat(65536) }) })), (error: unknown) => error instanceof InputError && error.status === 413);
});

test("saved buyer links can only open Stripe checkout origins", () => {
  assert.equal(safeStripeCheckoutUrl("https://checkout.stripe.com/c/pay/test-only"), "https://checkout.stripe.com/c/pay/test-only");
  assert.equal(safeStripeCheckoutUrl("https://buy.stripe.com/test-only"), "https://buy.stripe.com/test-only");
  for (const link of ["javascript:alert(1)", "https://checkout.stripe.com.attacker.example/", "http://checkout.stripe.com/", "https://checkout.stripe.com@attacker.example/", null]) {
    assert.equal(safeStripeCheckoutUrl(link), null);
  }
});
