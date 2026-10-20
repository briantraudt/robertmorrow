// Exercises the production orchestration and route handlers with isolated
// Stripe/database ports. The SQL suite separately verifies real transactions.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";

const RESERVATION = "11111111-1111-4111-8111-111111111111";
const SECOND_RESERVATION = "22222222-2222-4222-8222-222222222222";
const INTENT = "pi_test_one_original";
const SESSION = "cs_test_abcdefghijklmnopqrstuvwxyz";
const WEBHOOK_SIGNATURE = `t=1700000000,v1=${"a".repeat(64)}`;
const clone = <T>(value: T): T => structuredClone(value);
let api: any;
const originalFetch = globalThis.fetch;
const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const previousCheckoutFlag = process.env.INVENTORY_CHECKOUT_ENABLED;

before(async () => {
  // An accidental production client or network import fails the test outright.
  globalThis.fetch = async () => { throw new Error("Network is disabled in payment integration tests."); };
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_synthetic_test_only";
  process.env.INVENTORY_CHECKOUT_ENABLED = "true";
  const root = resolve(process.cwd());
  const stubs: Record<string, string> = {
    "test-ports": "export const ports = {}; export function configurePorts(next) { for (const key of Object.keys(ports)) delete ports[key]; Object.assign(ports, next); }",
    "server-only": "export {};",
    "next/cache": 'import {ports} from "test-ports"; export function revalidatePath(path) { ports.invalidations.push(path); }',
    "next/server": 'export class NextResponse extends Response { static json(value, init) { return new NextResponse(JSON.stringify(value), { ...init, headers: {"content-type":"application/json", ...init?.headers} }); } }',
    "test-stripe": 'import {ports} from "test-ports"; export function getStripe() { return ports.stripe; }',
    "test-database": 'import {ports} from "test-ports"; export function createServerSupabaseClient() { return ports.db; }',
    "test-webhook-secret": 'import {ports} from "test-ports"; export async function getInventoryWebhookSecret() { ports.calls.push({kind:"webhook:secret", args:[]}); return ports.resolveWebhookSecret(); }',
    "test-catalog": 'import {ports} from "test-ports"; export async function getPaintings() { return ports.catalog; }',
    "test-seo": 'export const siteUrl = "https://art.test.invalid";',
    "test-security": 'import { NextResponse } from "next/server"; export const isSameOrigin = () => true; export const rateLimit = () => ({ok: true, retryAfter: 0}); export const rateLimitResponse = () => NextResponse.json({}, {status:429}); export const forbiddenOriginResponse = () => NextResponse.json({}, {status:403});',
  };
  const result = await build({
    stdin: {
      contents: `export {configurePorts} from "test-ports";
        export * from ${JSON.stringify(resolve(root, "lib/inventory.ts"))};
        export {POST as checkoutPost} from ${JSON.stringify(resolve(root, "app/api/checkout/route.ts"))};
        export {POST as statusPost} from ${JSON.stringify(resolve(root, "app/api/checkout/status/route.ts"))};
        export {POST as cancelPost} from ${JSON.stringify(resolve(root, "app/api/checkout/cancel/route.ts"))};
        export {POST as webhookPost} from ${JSON.stringify(resolve(root, "app/api/webhook/route.ts"))};`,
      resolveDir: root,
      sourcefile: "payment-test-entry.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    logLevel: "silent",
    plugins: [{
      name: "payment-test-ports",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => {
          let id = args.path;
          if (/^(?:@\/lib\/stripe|\.\/stripe)$/.test(id)) id = "test-stripe";
          if (/^(?:@\/lib\/supabase\/server|\.\/supabase\/server)$/.test(id)) id = "test-database";
          if (id === "@/lib/paintings") id = "test-catalog";
          if (id === "./seo" || id === "@/lib/seo") id = "test-seo";
          if (id === "@/lib/security") id = "test-security";
          if (id === "@/lib/inventory-webhooks") id = "test-webhook-secret";
          if (id in stubs) return { path: id, namespace: "test-port" };
          return undefined;
        });
        builder.onLoad({ filter: /.*/, namespace: "test-port" }, (args) => ({ contents: stubs[args.path], loader: "js" }));
      },
    }],
  });
  const target = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(resolve(root, "package.json")), target, target.exports);
  api = target.exports;
});

after(() => {
  globalThis.fetch = originalFetch;
  if (previousWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
  if (previousCheckoutFlag === undefined) delete process.env.INVENTORY_CHECKOUT_ENABLED;
  else process.env.INVENTORY_CHECKOUT_ENABLED = previousCheckoutFlag;
});

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: RESERVATION, kind: "cart", status: "pending", painting_ids: ["original-one"],
    items: [{ id: "original-one", slug: "morning", title: "Morning", unit_amount: 65000 }],
    amount_total: 65000, buyer: { name: "Synthetic Buyer", email: "buyer@example.invalid", address: { line1: "1 Test St", line2: "", city: "Austin", state: "TX", postal_code: "78701", country: "US" } },
    stripe_payment_intent: null, stripe_session_id: null, offer_id: null,
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
    ...overrides,
  };
}

function intent(overrides: Record<string, unknown> = {}) {
  return {
    id: INTENT, status: "requires_payment_method", amount: 65000, amount_received: 65000,
    currency: "usd", client_secret: "pi_synthetic_secret_never_real", receipt_email: "buyer@example.invalid",
    metadata: { reservation_id: RESERVATION, painting_ids: "original-one", buyer_name: "Synthetic Buyer" },
    shipping: null, ...overrides,
  };
}

function session(overrides: Record<string, unknown> = {}) {
  return { id: SESSION, mode: "payment", status: "open", payment_status: "unpaid", payment_intent: INTENT,
    metadata: { reservation_id: RESERVATION, painting_ids: "original-one" }, ...overrides };
}

function fixture(input = reservation()) {
  const stored: any = clone(input);
  const calls: { kind: string; args: any[] }[] = [];
  const ports: any = {
    invalidations: [], calls, stored, nextIntent: intent(), nextSession: session(), expired: [],
    catalog: [{ id: "original-one", slug: "morning", title: "Morning", price: 999, status: "reserved", images: [] }],
    rpcHandler: null, createHandler: null, retrieveHandler: null, cancelHandler: null,
    webhookSecret: "whsec_synthetic_test_only", secretError: null,
  };
  const record = (kind: string, ...args: any[]) => calls.push({ kind, args: clone(args) });
  ports.resolveWebhookSecret = async () => {
    if (ports.secretError) throw ports.secretError;
    return ports.webhookSecret;
  };
  ports.db = {
    async rpc(name: string, args: any) {
      record(`rpc:${name}`, args);
      if (ports.rpcHandler) {
        const result = await ports.rpcHandler(name, args);
        if (result !== undefined) return result;
      }
      if (name === "bind_inventory_payment") {
        stored.stripe_payment_intent = args.p_payment_intent || stored.stripe_payment_intent;
        stored.stripe_session_id = args.p_session_id || stored.stripe_session_id;
        if (stored.status === "pending") stored.status = "active";
      } else if (name === "release_inventory") stored.status = "released";
      else if (name === "finalize_inventory_sale") stored.status = "paid";
      return { data: clone(stored), error: null };
    },
    from(name: string) {
      assert.equal(name, "inventory_reservations", "All inventory writes must use the transactional RPC.");
      const query: any = {};
      for (const method of ["select", "eq", "in", "lte", "order", "limit", "overlaps"]) query[method] = (...args: unknown[]) => { record(`query:${method}`, ...args); return query; };
      query.maybeSingle = async () => ({ data: clone(stored), error: null });
      query.then = (resolveValue: (value: unknown) => unknown, rejectValue: (reason: unknown) => unknown) => Promise.resolve({ data: clone(ports.expired), error: null }).then(resolveValue, rejectValue);
      return query;
    },
  };
  ports.stripe = {
    paymentIntents: {
      async create(params: any, options: any) { record("stripe:create", params, options); return ports.createHandler ? ports.createHandler(params, options) : clone(ports.nextIntent); },
      async retrieve(id: string) { record("stripe:retrieve", id); return ports.retrieveHandler ? ports.retrieveHandler(id) : clone(ports.nextIntent); },
      async cancel(...args: any[]) { record("stripe:cancel", ...args); return ports.cancelHandler ? ports.cancelHandler(...args) : intent({ status: "canceled" }); },
    },
    checkout: { sessions: {
      async create(params: any, options: any) { record("stripe:session-create", params, options); return clone(ports.nextSession); },
      async retrieve(id: string) { record("stripe:session-retrieve", id); return clone(ports.nextSession); },
      async expire(id: string) { record("stripe:session-expire", id); return session({ status: "expired" }); },
    } },
    webhooks: { constructEvent(raw: string, signature: string, secret: string) {
      record("stripe:signature", raw, signature, secret);
      if (signature !== WEBHOOK_SIGNATURE || secret !== ports.webhookSecret) throw new Error("Invalid signature.");
      return JSON.parse(raw);
    } },
  };
  api.configurePorts(ports);
  return ports;
}

function count(ports: any, kind: string) { return ports.calls.filter((call: any) => call.kind === kind).length; }
function jsonRequest(path: string, body: unknown, raw = false) {
  return new Request(`https://art.test.invalid${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: raw ? String(body) : JSON.stringify(body) });
}
function eventRequest(object = intent({ status: "succeeded" }), signature = WEBHOOK_SIGNATURE) {
  return new Request("https://art.test.invalid/api/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: JSON.stringify({ id: "evt_synthetic", type: "payment_intent.succeeded", data: { object } }) });
}

test("a retired test payment is released without reporting a purchase or changing its reservation", async () => {
  const f = fixture();
  f.rpcHandler = async (name: string) => name === "finalize_inventory_sale"
    ? { data: { status: "void_test", order_id: "synthetic-test-order", painting_ids: ["original-one"], already_recorded: true }, error: null }
    : undefined;
  const result = await api.finalizePayment(intent({ status: "succeeded", metadata: { painting_ids: "original-one" } }));
  assert.deepEqual(result, { status: "released" });
  assert.equal(f.stored.status, "pending");
  assert.equal(count(f, "rpc:finalize_inventory_sale"), 1);
  assert.equal(count(f, "rpc:release_inventory"), 0);
  assert.equal(count(f, "stripe:create"), 0);
});

test("a verified replay of a retired test payment is acknowledged without another sale", async () => {
  const f = fixture();
  f.rpcHandler = async (name: string) => name === "finalize_inventory_sale"
    ? { data: { status: "void_test", order_id: "synthetic-test-order", painting_ids: ["original-one"], already_recorded: true }, error: null }
    : undefined;
  const response = await api.webhookPost(eventRequest(intent({ status: "succeeded", metadata: { painting_ids: "original-one" } })));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(count(f, "stripe:signature"), 1);
  assert.equal(count(f, "rpc:finalize_inventory_sale"), 1);
  assert.equal(f.stored.status, "pending");
});

test("a Stripe client secret is not returned before the payment is bound to the inventory hold", async () => {
  const r = reservation();
  const f = fixture(r);
  let completeBind!: () => void;
  const gate = new Promise<void>((done) => { completeBind = done; });
  f.rpcHandler = async (name: string) => { if (name === "bind_inventory_payment") await gate; };
  let completed = false;
  const pending = api.ensureCartPayment(r).then((result: any) => { completed = true; return result; });
  await new Promise(setImmediate);
  assert.equal(count(f, "stripe:create"), 1);
  assert.equal(count(f, "rpc:bind_inventory_payment"), 1);
  assert.equal(completed, false);
  completeBind();
  assert.equal((await pending).client_secret, "pi_synthetic_secret_never_real");
  assert.equal(f.stored.status, "active");
});

test("pending creation recovery reuses the exact Stripe idempotency key and immutable amount snapshot", async () => {
  const r = reservation();
  const f = fixture(r);
  let failures = 1;
  f.rpcHandler = async (name: string) => name === "bind_inventory_payment" && failures-- > 0 ? { data: null, error: { code: "XX000", message: "Synthetic bind outage" } } : undefined;
  await assert.rejects(api.ensureCartPayment(r), /Inventory could not be updated/);
  const recovered = await api.ensureCartPayment(r);
  const creates = f.calls.filter((call: any) => call.kind === "stripe:create");
  assert.equal(recovered.id, INTENT);
  assert.equal(creates.length, 2);
  assert.deepEqual(creates[0].args, creates[1].args);
  assert.equal(creates[0].args[1].idempotencyKey, `rm-cart-${RESERVATION}`);
  assert.equal(creates[0].args[0].amount, 65000);
  assert.equal(count(f, "rpc:release_inventory"), 0);
});

test("ambiguous Stripe creation errors retain inventory and can recover with the same key", async () => {
  const r = reservation();
  const f = fixture(r);
  f.createHandler = async () => { throw new Error("Synthetic connection timeout after provider creation"); };
  await assert.rejects(api.ensureCartPayment(r), /timeout/);
  assert.equal(count(f, "rpc:bind_inventory_payment"), 0);
  assert.equal(count(f, "rpc:release_inventory"), 0);
  f.createHandler = null;
  await api.ensureCartPayment(r);
  const creates = f.calls.filter((call: any) => call.kind === "stripe:create");
  assert.deepEqual(creates[0].args, creates[1].args);
});

test("cancellation raced with payment success finalizes the order and never releases inventory", async () => {
  const r = reservation({ status: "active", stripe_payment_intent: INTENT });
  const f = fixture(r);
  let reads = 0;
  f.retrieveHandler = async () => intent({ status: reads++ ? "succeeded" : "requires_payment_method" });
  f.cancelHandler = async () => { throw new Error("Payment succeeded before cancellation"); };
  const result = await api.cancelReservation(r);
  assert.equal(result.status, "paid");
  assert.equal(count(f, "rpc:finalize_inventory_sale"), 1);
  assert.equal(count(f, "rpc:release_inventory"), 0);
});

test("stale pending reservation recovery also respects a payment that already succeeded", async () => {
  const r = reservation();
  const f = fixture(r);
  f.nextIntent = intent({ status: "succeeded" });
  const result = await api.cancelReservation(r);
  assert.equal(result.status, "paid");
  assert.equal(count(f, "stripe:cancel"), 0);
  assert.equal(count(f, "rpc:release_inventory"), 0);
  assert.equal(count(f, "rpc:bind_inventory_payment"), 1);
});

test("processing payments and uncertain provider errors preserve the hold", async () => {
  const r = reservation({ status: "active", stripe_payment_intent: INTENT });
  const f = fixture(r);
  f.nextIntent = intent({ status: "processing" });
  assert.equal((await api.cancelReservation(r)).status, "processing");
  assert.equal(count(f, "stripe:cancel"), 0);
  assert.equal(count(f, "rpc:release_inventory"), 0);
  f.retrieveHandler = async () => { throw new Error("Synthetic provider outage"); };
  await assert.rejects(api.cancelReservation(r), /provider outage/);
  assert.equal(count(f, "rpc:release_inventory"), 0);
});

test("inventory releases only after Stripe acknowledges cancellation", async () => {
  const r = reservation({ status: "active", stripe_payment_intent: INTENT });
  const f = fixture(r);
  assert.equal((await api.cancelReservation(r)).status, "released");
  const kinds = f.calls.map((call: any) => call.kind);
  assert.ok(kinds.indexOf("stripe:cancel") < kinds.indexOf("rpc:release_inventory"));
  assert.equal(count(f, "rpc:release_inventory"), 1);
});

test("a stale cancellation reports paid when the database already finalized the reservation", async () => {
  const r = reservation({ status: "active", stripe_payment_intent: INTENT });
  const f = fixture(r);
  f.nextIntent = intent({ status: "canceled" });
  f.rpcHandler = async (name: string) => {
    if (name !== "release_inventory") return undefined;
    // The transaction locks and reads its authoritative row. A stale caller
    // must preserve both that paid status and the correct customer-facing result.
    f.stored.status = "paid";
    return { data: clone(f.stored), error: null };
  };
  const result = await api.cancelReservation(r);
  assert.deepEqual(result, { status: "paid", paintingIds: ["original-one"], orderRef: INTENT.slice(-10).toUpperCase() });
  assert.equal(f.stored.status, "paid");
  assert.equal(count(f, "rpc:release_inventory"), 1);
  assert.equal(count(f, "stripe:cancel"), 0);
  assert.equal(count(f, "rpc:finalize_inventory_sale"), 0);
});

test("payment and checkout-session identities must match before order finalization", async () => {
  const f = fixture(reservation({ status: "active", stripe_payment_intent: INTENT }));
  await assert.rejects(api.finalizePayment(intent({ status: "succeeded" }), session({ payment_status: "paid", payment_intent: "pi_other" })), /not been verified/);
  await assert.rejects(api.finalizePayment(intent({ status: "succeeded" }), session({ payment_status: "paid", metadata: { reservation_id: SECOND_RESERVATION, painting_ids: "original-one" } })), /does not match/);
  assert.equal(count(f, "rpc:finalize_inventory_sale"), 0);
});

test("checkout prices are taken from the reservation and the secret is withheld on binding errors", async () => {
  const r = reservation();
  const f = fixture(r);
  const body = { reservationId: RESERVATION, items: [{ id: "original-one", price: 1 }], ...r.buyer };
  const response = await api.checkoutPost(jsonRequest("/api/checkout", body));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.total, 650);
  assert.equal(data.items[0].price, 650);
  assert.equal(data.reservationId, RESERVATION);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const broken = fixture(r);
  broken.rpcHandler = async (name: string) => name === "bind_inventory_payment" ? { data: null, error: { code: "XX000", message: "Synthetic bind failure" } } : undefined;
  const failure = await api.checkoutPost(jsonRequest("/api/checkout", body));
  assert.equal(failure.status, 503);
  assert.equal("clientSecret" in await failure.json(), false);
  assert.equal(count(broken, "rpc:release_inventory"), 0);
});

test("bad webhook signatures never touch inventory; database failures request a Stripe retry", async () => {
  const r = reservation({ status: "active", stripe_payment_intent: INTENT });
  const f = fixture(r);
  assert.equal((await api.webhookPost(eventRequest(intent({ status: "succeeded" }), "invalid"))).status, 400);
  assert.equal(count(f, "rpc:finalize_inventory_sale"), 0);
  f.rpcHandler = async (name: string) => name === "finalize_inventory_sale" ? { data: null, error: { code: "XX000", message: "Synthetic SQL failure" } } : undefined;
  assert.equal((await api.webhookPost(eventRequest())).status, 500);
  assert.equal(count(f, "rpc:finalize_inventory_sale"), 1);
  assert.equal(count(f, "rpc:release_inventory"), 0);
});

test("webhook secret lookup failures return 503 without signature processing or inventory writes", async () => {
  const f = fixture();
  f.secretError = new Error("Synthetic Vault outage");
  const unavailable = await api.webhookPost(eventRequest());
  assert.equal(unavailable.status, 503);
  assert.equal(count(f, "webhook:secret"), 1);
  assert.equal(count(f, "stripe:signature"), 0);
  assert.equal(count(f, "rpc:finalize_inventory_sale"), 0);
  assert.equal((await unavailable.text()).includes("Vault"), false);
});

test("webhooks use the internally resolved secret and reject absent or malformed signatures before lookup", async () => {
  const f = fixture(reservation({ status: "active", stripe_payment_intent: INTENT }));
  const missing = new Request("https://art.test.invalid/api/webhook", { method: "POST", body: "{}" });
  assert.equal((await api.webhookPost(missing)).status, 400);
  assert.equal((await api.webhookPost(eventRequest(intent(), "not-a-signature"))).status, 400);
  assert.equal(count(f, "webhook:secret"), 0);
  f.webhookSecret = "whsec_syntheticStoredSecret";
  assert.equal((await api.webhookPost(eventRequest())).status, 200);
  const verified = f.calls.find((call: any) => call.kind === "stripe:signature");
  assert.equal(verified.args[2], "whsec_syntheticStoredSecret");
  assert.equal(count(f, "rpc:finalize_inventory_sale"), 1);
});

test("duplicate successful callbacks use the same single transactional finalization command", async () => {
  const f = fixture(reservation({ status: "active", stripe_payment_intent: INTENT }));
  const responses = await Promise.all([api.webhookPost(eventRequest()), api.webhookPost(eventRequest())]);
  assert.deepEqual(responses.map((response: Response) => response.status), [200, 200]);
  const writes = f.calls.filter((call: any) => call.kind.startsWith("rpc:"));
  assert.equal(writes.length, 2);
  assert.equal(writes[0].kind, "rpc:finalize_inventory_sale");
  assert.deepEqual(writes[0], writes[1]);
  assert.equal(writes[0].args[0].p_payment_intent, INTENT);
  assert.equal(writes[0].args[0].p_amount_total, 65000);
});

test("status and cancellation reject malformed JSON and non-object bodies with 400", async () => {
  const f = fixture();
  for (const route of [api.statusPost, api.cancelPost]) {
    for (const raw of ["{", "null", "[]", '"text"']) {
      const response = await route(jsonRequest("/api/checkout/status", raw, true));
      assert.equal(response.status, 400);
    }
  }
  assert.equal(f.calls.length, 0);
});

test("checkout stays closed until the inventory rollout is explicitly enabled", async () => {
  const r = reservation();
  const f = fixture(r);
  process.env.INVENTORY_CHECKOUT_ENABLED = "false";
  try {
    const response = await api.checkoutPost(jsonRequest("/api/checkout", { reservationId: RESERVATION, items: [{ id: "original-one" }], ...r.buyer }));
    assert.equal(response.status, 503);
    assert.equal(f.calls.length, 0);
  } finally {
    process.env.INVENTORY_CHECKOUT_ENABLED = "true";
  }
});
