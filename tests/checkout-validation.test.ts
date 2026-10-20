import test from "node:test";
import assert from "node:assert/strict";
import { CheckoutError, validateCheckoutBody } from "../lib/checkout-validation";

const valid = {
  items: [{ id: "rm-painting-b", price: 1 }, { id: "rm-painting-a", price: -500 }],
  email: " Collector@Example.com ", name: " Art Collector ",
  address: { line1: "1 Test Street", city: "Testville", state: "NY", postal_code: "10001" },
  reservationId: "11111111-1111-4111-8111-111111111111",
};

test("checkout accepts normalized buyer details and only extracts sorted painting IDs", () => {
  const result = validateCheckoutBody(valid);
  assert.deepEqual(result.ids, ["rm-painting-a", "rm-painting-b"]);
  assert.equal(result.buyer.email, "collector@example.com");
  assert.equal(result.buyer.name, "Art Collector");
  assert.equal(result.buyer.address.country, "US");
  assert.equal(result.buyer.address.line2, "");
  assert.equal(result.reservationId, valid.reservationId);
  assert.equal("price" in result, false);
});

test("checkout rejects duplicate, malformed, empty, and oversized carts", () => {
  for (const items of [[], [{ id: "same" }, { id: "same" }], [{ id: "x),status.eq.available" }], [null], Array.from({ length: 11 }, (_, i) => ({ id: `p-${i}` }))]) {
    assert.throws(() => validateCheckoutBody({ ...valid, items }), CheckoutError);
  }
  for (const body of [null, [], "string", 12]) assert.throws(() => validateCheckoutBody(body), CheckoutError);
});

test("checkout references cannot be injected or confused with provider IDs", () => {
  for (const reservationId of ["pi_example", "not-a-uuid", "11111111-1111-1111-1111-111111111111", null, 1]) {
    assert.throws(() => validateCheckoutBody({ ...valid, reservationId }), CheckoutError);
  }
});

test("checkout rejects invalid buyer details and unsupported delivery addresses", () => {
  for (const patch of [{ email: "invalid" }, { email: "a".repeat(260) + "@example.com" }, { name: " " }, { address: null }, { address: { ...valid.address, country: "CA" } }, { address: { ...valid.address, postal_code: "bad" } }]) {
    assert.throws(() => validateCheckoutBody({ ...valid, ...patch }), CheckoutError);
  }
  assert.equal(validateCheckoutBody({ ...valid, address: { ...valid.address, postal_code: "10001-1234" } }).buyer.address.postal_code, "10001-1234");
});
