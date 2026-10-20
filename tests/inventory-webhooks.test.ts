import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import Stripe from "stripe";

const REPLACEMENT = "we_syntheticReplacement";
const LEGACY = ["we_1TQZJaPORrohA5Kj5sbkBsG4", "we_1TQZ3QPORrohA5Kj5i3gCgsC"];
const URL = "https://www.robertmorrow.art/api/webhook";
const OLD_URL = "https://robertmorrow.art/api/webhook";
const SECRET = "whsec_syntheticTestOnlyNotReal";
const EVENTS = ["payment_intent.succeeded", "payment_intent.canceled", "checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded"];
const copy = <T>(value: T): T => structuredClone(value);
const originalFetch = globalThis.fetch;
const previousFlag = process.env.INVENTORY_CHECKOUT_ENABLED;
const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
let api: any;
let activeFixture: any;

before(async () => {
  globalThis.fetch = async (input, init) => {
    if (!activeFixture?.fetchHandler) throw new Error("Network is disabled in webhook installation tests.");
    activeFixture.calls.push({ kind: "verification-request" });
    return activeFixture.fetchHandler(input, init);
  };
  process.env.INVENTORY_CHECKOUT_ENABLED = "false";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_syntheticLegacyOnly";
  const root = resolve(process.cwd());
  const stubs: Record<string, string> = {
    "test-ports": "export let ports; export function configurePorts(next) { ports = next; }",
    "server-only": "export {};",
    "./stripe": 'import {ports} from "test-ports"; export function getStripe() { ports.calls.push({kind:"client"}); return ports.stripe; }',
    "./supabase/server": 'import {ports} from "test-ports"; export function createServerSupabaseClient() { return ports.db; }',
    "next/server": 'export class NextResponse extends Response { static json(value, init) { return new NextResponse(JSON.stringify(value), { ...init, headers: {"content-type":"application/json", ...init?.headers} }); } }',
    "@/lib/inventory": 'import {ports} from "test-ports"; export async function finalizePayment() { ports.businessCalls++; throw new Error("No-op verification must not finalize payments"); } export const finalizeSession = finalizePayment; export const getReservation = finalizePayment; export const cancelReservation = finalizePayment;',
  };
  const result = await build({
    stdin: {
      contents: `export {configurePorts} from "test-ports"; export * from ${JSON.stringify(resolve(root, "lib/inventory-webhooks.ts"))}; export {POST as webhookPost} from ${JSON.stringify(resolve(root, "app/api/webhook/route.ts"))};`,
      resolveDir: root, sourcefile: "webhook-test-entry.ts", loader: "ts",
    },
    bundle: true, write: false, platform: "node", format: "cjs", logLevel: "silent",
    plugins: [{ name: "isolated-webhook-ports", setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        const path = args.path === "@/lib/stripe" ? "./stripe" : args.path;
        return path in stubs ? { path, namespace: "test-port" } : undefined;
      });
      builder.onLoad({ filter: /.*/, namespace: "test-port" }, (args) => ({ contents: stubs[args.path], loader: "js" }));
    } }],
  });
  const target = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(resolve(root, "package.json")), target, target.exports);
  api = target.exports;
});

after(() => {
  globalThis.fetch = originalFetch;
  if (previousFlag === undefined) delete process.env.INVENTORY_CHECKOUT_ENABLED;
  else process.env.INVENTORY_CHECKOUT_ENABLED = previousFlag;
  if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
});

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: REPLACEMENT, object: "webhook_endpoint", url: URL, status: "enabled", api_version: "2025-02-24.acacia",
    metadata: { site: "robertmorrow.art", purpose: "inventory-v1" }, enabled_events: [...EVENTS],
    secret: SECRET, livemode: true, ...overrides,
  };
}

function storedWebhook(overrides: Record<string, unknown> = {}) {
  return { id: REPLACEMENT, secret: SECRET, verified_at: "2026-10-20T12:00:00Z", ...overrides };
}

function fixture(stored: any = null) {
  const rows: Record<string, any> = {
    [REPLACEMENT]: endpoint(),
    [LEGACY[0]]: endpoint({ id: LEGACY[0], url: OLD_URL, metadata: {}, enabled_events: ["payment_intent.succeeded", "checkout.session.completed"] }),
    [LEGACY[1]]: endpoint({ id: LEGACY[1], url: OLD_URL, metadata: {}, enabled_events: ["checkout.session.completed"] }),
    we_unrelated: endpoint({ id: "we_unrelated", url: OLD_URL, metadata: { purpose: "another integration" } }),
  };
  const f: any = { rows, calls: [], stored: copy(stored), createHandler: null, updateHandler: null, retrieveHandler: null, rpcHandler: null, fetchHandler: null, businessCalls: 0 };
  f.db = { async rpc(name: string, args: any) {
    f.calls.push({ kind: `rpc:${name}`, args: copy(args) });
    if (f.rpcHandler) {
      const result = await f.rpcHandler(name, args);
      if (result !== undefined) return result;
    }
    if (name === "rm_get_inventory_webhook") return { data: copy(f.stored), error: null };
    if (name === "rm_store_inventory_webhook") {
      f.stored = { id: args.p_endpoint_id, secret: args.p_secret, verified_at: null };
      return { data: { id: args.p_endpoint_id, stored: true }, error: null };
    }
    if (name === "rm_verify_inventory_webhook") {
      assert.equal(f.stored.id, args.p_endpoint_id);
      f.stored.verified_at = new Date().toISOString();
      return { data: { id: args.p_endpoint_id, verified: true, verified_at: f.stored.verified_at }, error: null };
    }
    throw new Error("Unexpected test database operation.");
  } };
  f.stripe = { webhooks: Stripe.webhooks, webhookEndpoints: {
    async create(params: unknown, options: unknown) {
      f.calls.push({ kind: "create", args: copy([params, options]) });
      if (f.createHandler) return f.createHandler(params, options);
      return copy(rows[REPLACEMENT]);
    },
    async retrieve(id: string) {
      f.calls.push({ kind: "retrieve", id });
      if (f.retrieveHandler) return f.retrieveHandler(id);
      assert.ok(rows[id], "Only fixture webhook endpoints may be retrieved.");
      return copy(rows[id]);
    },
    async update(id: string, params: any, options: unknown) {
      f.calls.push({ kind: "update", id, args: copy([params, options]) });
      assert.ok(LEGACY.includes(id), "The replacement and unrelated endpoints must never be mutated.");
      if (f.updateHandler) {
        const result = await f.updateHandler(id, params, options);
        if (result !== undefined) return result;
      }
      assert.deepEqual(params, { disabled: true });
      rows[id].status = "disabled";
      return copy(rows[id]);
    },
  } };
  activeFixture = f;
  api.configurePorts(f);
  return f;
}

function writes(f: any) { return f.calls.filter((call: any) => call.kind === "update"); }

test("installation is refused before any Stripe call when checkout is enabled", async () => {
  const f = fixture();
  process.env.INVENTORY_CHECKOUT_ENABLED = "true";
  try {
    await assert.rejects(api.installInventoryWebhook(), /Pause inventory checkout/);
    assert.equal(f.calls.length, 0);
  } finally { process.env.INVENTORY_CHECKOUT_ENABLED = "false"; }
});

test("installation uses the exact canonical endpoint, five events and stable idempotency key", async (t) => {
  const f = fixture();
  const logs = [t.mock.method(console, "log", () => {}), t.mock.method(console, "error", () => {})];
  const result = await api.installInventoryWebhook();
  const call = f.calls.find((entry: any) => entry.kind === "create");
  assert.deepEqual(call.args, [{
    url: URL, enabled_events: EVENTS, api_version: "2025-02-24.acacia", connect: false,
    metadata: { site: "robertmorrow.art", purpose: "inventory-v1" },
    description: "Robert Morrow painting inventory and payment fulfillment",
  }, { idempotencyKey: "rm-inventory-webhook-2026-10-20" }]);
  assert.deepEqual(result, { id: REPLACEMENT, stored: true, url: URL, status: "enabled", events: EVENTS });
  assert.deepEqual(f.stored, storedWebhook({ verified_at: null }));
  const persistence = f.calls.find((entry: any) => entry.kind === "rpc:rm_store_inventory_webhook");
  assert.deepEqual(persistence.args, { p_endpoint_id: REPLACEMENT, p_secret: SECRET });
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  assert.equal(writes(f).length, 0);
  for (const log of logs) assert.equal(log.mock.callCount(), 0, "The signing secret must never be logged.");
});

test("an ambiguous install failure retries with unchanged parameters and idempotency key", async () => {
  const f = fixture();
  f.createHandler = async () => { throw new Error("Synthetic provider timeout"); };
  await assert.rejects(api.installInventoryWebhook(), /provider timeout/);
  f.createHandler = null;
  await api.installInventoryWebhook();
  const calls = f.calls.filter((call: any) => call.kind === "create");
  assert.deepEqual(calls[0].args, calls[1].args);
});

test("installation fails closed if Stripe omits the signing secret or returns incorrect configuration", async () => {
  for (const patch of [{ secret: undefined }, { secret: "" }, { secret: "not-a-signing-secret" }, { url: OLD_URL }]) {
    const f = fixture();
    Object.assign(f.rows[REPLACEMENT], patch);
    await assert.rejects(api.installInventoryWebhook(), /secret|configuration/);
    assert.equal(writes(f).length, 0);
  }
});

test("retirement is allowed after checkout opens and changes only the two audited legacy endpoints", async () => {
  const f = fixture(storedWebhook());
  process.env.INVENTORY_CHECKOUT_ENABLED = "true";
  let result;
  try { result = await api.retireLegacyWebhooks(REPLACEMENT); }
  finally { process.env.INVENTORY_CHECKOUT_ENABLED = "false"; }
  assert.deepEqual(writes(f).map((call: any) => call.id), LEGACY);
  assert.deepEqual(f.calls.filter((call: any) => call.kind === "retrieve").map((call: any) => call.id), [REPLACEMENT, ...LEGACY]);
  assert.equal(f.calls.filter((call: any) => call.kind === "retrieve").length, 3);
  const firstWrite = f.calls.findIndex((call: any) => call.kind === "update");
  assert.equal(f.calls.slice(firstWrite).some((call: any) => call.kind === "retrieve"), false, "All three records are verified before the first disable.");
  assert.equal(f.rows[REPLACEMENT].status, "enabled");
  assert.equal(f.rows.we_unrelated.status, "enabled");
  assert.deepEqual(result.retired.map((row: any) => row.id), LEGACY);
  assert.deepEqual(result.alreadyDisabled, []);
  assert.equal(JSON.stringify(result).includes("secret"), false, "Retirement returns only explicit nonsecret summaries.");
  assert.equal(JSON.stringify(result).includes(SECRET), false);
});

test("replacement identity, metadata, API version and the entire event set are verified before retirement", async () => {
  const patches = [
    { id: "we_other" }, { status: "disabled" }, { url: OLD_URL }, { url: "https://example.invalid/api/webhook" },
    { metadata: { site: "other-site", purpose: "inventory-v1" } },
    { metadata: { site: "robertmorrow.art", purpose: "other-purpose" } },
    { api_version: "2024-06-20" }, { enabled_events: ["*"] },
    { enabled_events: EVENTS.slice(1) }, { enabled_events: [...EVENTS, "charge.succeeded"] },
  ];
  for (const patch of patches) {
    const f = fixture(storedWebhook());
    Object.assign(f.rows[REPLACEMENT], patch);
    await assert.rejects(api.retireLegacyWebhooks(REPLACEMENT), /configuration/);
    assert.equal(writes(f).length, 0);
    assert.deepEqual(f.calls.filter((call: any) => call.kind === "retrieve").map((call: any) => call.id), [REPLACEMENT]);
  }
});

test("a changed legacy endpoint prevents both disables, including an endpoint on the correct domain with the wrong path", async () => {
  for (const patch of [
    { url: "https://example.invalid/api/webhook" }, { url: URL },
    { url: "https://robertmorrow.art/another-webhook" }, { url: `${OLD_URL}?another-integration=1` },
    { url: "https://robertmorrow.art@example.invalid/api/webhook" },
    { id: "we_other" }, { livemode: false },
  ]) {
    const f = fixture(storedWebhook());
    Object.assign(f.rows[LEGACY[1]], patch);
    await assert.rejects(api.retireLegacyWebhooks(REPLACEMENT), /no longer matches/);
    assert.equal(writes(f).length, 0);
    assert.equal(f.rows[LEGACY[0]].status, "enabled");
  }
});

test("already-disabled legacy endpoints are left unchanged and repeat retirement is safe", async () => {
  const f = fixture(storedWebhook());
  f.rows[LEGACY[0]].status = "disabled";
  const first = await api.retireLegacyWebhooks(REPLACEMENT);
  assert.deepEqual(writes(f).map((call: any) => call.id), [LEGACY[1]]);
  assert.deepEqual(first.alreadyDisabled.map((row: any) => row.id), [LEGACY[0]]);
  const second = await api.retireLegacyWebhooks(REPLACEMENT);
  assert.deepEqual(second.retired, []);
  assert.deepEqual(second.alreadyDisabled.map((row: any) => row.id), LEGACY);
  assert.equal(writes(f).length, 1);
});

test("a partial provider failure can resume without changing the replacement or unrelated endpoints", async () => {
  const f = fixture(storedWebhook());
  f.updateHandler = async (id: string) => { if (id === LEGACY[1]) throw new Error("Synthetic disable outage"); };
  await assert.rejects(api.retireLegacyWebhooks(REPLACEMENT), /disable outage/);
  assert.equal(f.rows[LEGACY[0]].status, "disabled");
  assert.equal(f.rows[LEGACY[1]].status, "enabled");
  f.updateHandler = null;
  const result = await api.retireLegacyWebhooks(REPLACEMENT);
  assert.deepEqual(result.alreadyDisabled.map((row: any) => row.id), [LEGACY[0]]);
  assert.deepEqual(result.retired.map((row: any) => row.id), [LEGACY[1]]);
  const retry = writes(f).filter((call: any) => call.id === LEGACY[1]);
  assert.deepEqual(retry[0].args, retry[1].args);
  assert.equal(f.rows.we_unrelated.status, "enabled");
});

test("retirement refuses to report success when Stripe does not confirm disabled", async () => {
  const f = fixture(storedWebhook());
  f.updateHandler = async (id: string) => copy(f.rows[id]);
  await assert.rejects(api.retireLegacyWebhooks(REPLACEMENT), /did not confirm/);
  assert.equal(writes(f).length, 1);
});

test("invalid or legacy replacement IDs and retrieval failures cause no endpoint writes", async () => {
  for (const id of [undefined, "", "we_bad/path", ...LEGACY]) {
    const f = fixture();
    await assert.rejects(api.retireLegacyWebhooks(id), /distinct replacement/);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture(storedWebhook());
  f.retrieveHandler = async () => { throw new Error("Synthetic read outage"); };
  await assert.rejects(api.retireLegacyWebhooks(REPLACEMENT), /read outage/);
  assert.equal(writes(f).length, 0);
});

test("an existing stored endpoint is verified and reused without creating or exposing another secret", async () => {
  const f = fixture(storedWebhook());
  const result = await api.installInventoryWebhook();
  assert.deepEqual(result, { id: REPLACEMENT, stored: true, url: URL, status: "enabled", events: EVENTS });
  assert.equal(f.calls.some((call: any) => call.kind === "create" || call.kind === "rpc:rm_store_inventory_webhook"), false);
  assert.deepEqual(f.calls.filter((call: any) => call.kind === "retrieve").map((call: any) => call.id), [REPLACEMENT]);
});

test("installation waits for encrypted persistence and recovers storage failure with the same Stripe create request", async () => {
  const f = fixture();
  f.rpcHandler = async (name: string) => name === "rm_store_inventory_webhook" ? { data: null, error: { message: `Synthetic private database error containing ${SECRET}` } } : undefined;
  await assert.rejects(api.installInventoryWebhook(), (error: Error) => {
    assert.equal(error.message.includes(SECRET), false);
    return /could not be accessed/.test(error.message);
  });
  assert.equal(f.stored, null);
  let finishStore!: () => void;
  const gate = new Promise<void>((done) => { finishStore = done; });
  f.rpcHandler = async (name: string) => { if (name === "rm_store_inventory_webhook") await gate; };
  let completed = false;
  const pending = api.installInventoryWebhook().then((result: unknown) => { completed = true; return result; });
  await new Promise(setImmediate);
  assert.equal(completed, false);
  finishStore();
  const result = await pending;
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  const creates = f.calls.filter((call: any) => call.kind === "create");
  assert.deepEqual(creates[0].args, creates[1].args);
  assert.equal(f.stored.secret, SECRET);
});

test("Vault lookup failures and malformed stored settings never fall back to the legacy environment secret", async () => {
  const broken = fixture();
  broken.rpcHandler = async () => ({ data: null, error: { message: `Synthetic error ${SECRET}` } });
  await assert.rejects(api.getInventoryWebhookSecret(), /could not be accessed/);
  await assert.rejects(api.installInventoryWebhook(), /could not be accessed/);
  assert.equal(broken.calls.some((call: any) => call.kind === "client"), false);
  fixture(storedWebhook({ secret: "" }));
  await assert.rejects(api.getInventoryWebhookSecret(), /configuration is invalid/);
  fixture(storedWebhook());
  assert.equal(await api.getInventoryWebhookSecret(), SECRET);
  fixture();
  assert.equal(await api.getInventoryWebhookSecret(), "whsec_syntheticLegacyOnly");
});

test("verification signs a harmless no-op with the stored secret and the real handler accepts it before marking verified", async () => {
  const f = fixture(storedWebhook({ verified_at: null }));
  let postedPayload: any;
  f.fetchHandler = async (input: string, init: RequestInit) => {
    assert.equal(input, URL);
    assert.equal(init.redirect, "error");
    assert.equal(init.method, "POST");
    postedPayload = JSON.parse(String(init.body));
    assert.equal(f.stored.verified_at, null);
    // The actual Stripe SDK verifies the HMAC in the actual bundled handler.
    // All database access still stays in the fixture and there is no network.
    return api.webhookPost(new Request(input, init));
  };
  const result = await api.verifyInventoryWebhook();
  assert.deepEqual(result, { id: REPLACEMENT, verified: true });
  assert.equal(postedPayload.type, "inventory.verification");
  assert.deepEqual(postedPayload.data.object, {});
  assert.match(postedPayload.id, /^evt_inventory_verification_/);
  assert.equal(f.businessCalls, 0);
  assert.ok(f.stored.verified_at);
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  assert.equal(f.calls.filter((call: any) => call.kind === "rpc:rm_verify_inventory_webhook").length, 1);
});

test("failed verification, wrong-secret delivery and failed verification persistence cannot authorize retirement", async () => {
  const responses = [
    async () => new Response(JSON.stringify({ received: true }), { status: 301 }),
    async () => new Response(JSON.stringify({ received: true }), { status: 500 }),
    async () => new Response(JSON.stringify({ received: false }), { status: 200 }),
    async () => new Response("invalid JSON", { status: 200 }),
    async () => { throw new Error(`Synthetic timeout with private header ${SECRET}`); },
  ];
  for (const response of responses) {
    const f = fixture(storedWebhook({ verified_at: null }));
    f.fetchHandler = response;
    await assert.rejects(api.verifyInventoryWebhook(), (error: Error) => {
      assert.equal(error.message.includes(SECRET), false);
      return /did not acknowledge/.test(error.message);
    });
    assert.equal(f.calls.some((call: any) => call.kind === "rpc:rm_verify_inventory_webhook"), false);
    assert.equal(f.stored.verified_at, null);
  }
  const wrongSecret = fixture(storedWebhook({ verified_at: null }));
  wrongSecret.fetchHandler = async (input: string, init: RequestInit) => {
    wrongSecret.stored.secret = "whsec_syntheticOtherSecret";
    return api.webhookPost(new Request(input, init));
  };
  await assert.rejects(api.verifyInventoryWebhook(), /did not acknowledge/);
  assert.equal(wrongSecret.stored.verified_at, null);
  assert.equal(wrongSecret.businessCalls, 0);

  const failedStore = fixture(storedWebhook({ verified_at: null }));
  failedStore.fetchHandler = async () => Response.json({ received: true });
  failedStore.rpcHandler = async (name: string) => name === "rm_verify_inventory_webhook" ? { data: null, error: { message: SECRET } } : undefined;
  await assert.rejects(api.verifyInventoryWebhook(), /could not be accessed/);
  assert.equal(failedStore.stored.verified_at, null);
});

test("retirement requires a matching stored endpoint with a completed verification", async () => {
  for (const stored of [null, storedWebhook({ verified_at: null }), storedWebhook({ id: "we_otherStoredEndpoint" })]) {
    const f = fixture(stored);
    await assert.rejects(api.retireLegacyWebhooks(REPLACEMENT), /stored replacement webhook must be verified/);
    assert.equal(f.calls.some((call: any) => call.kind === "client"), false);
  }
  const f = fixture();
  await assert.rejects(api.verifyInventoryWebhook(), /Install and store/);
  assert.equal(f.calls.some((call: any) => call.kind === "verification-request"), false);
});

test("the real webhook route returns 503 on Vault failure, uses a stored secret, and uses env only for absent configuration", async () => {
  const payload = JSON.stringify({ id: "evt_syntheticNoop", object: "event", type: "inventory.verification", data: { object: {} } });
  const request = (secret: string) => new Request(URL, {
    method: "POST", body: payload, headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret }) },
  });
  const f = fixture(storedWebhook());
  assert.equal((await api.webhookPost(request(SECRET))).status, 200);
  assert.equal((await api.webhookPost(request("whsec_syntheticLegacyOnly"))).status, 400);
  f.stored = null;
  assert.equal((await api.webhookPost(request("whsec_syntheticLegacyOnly"))).status, 200);
  f.rpcHandler = async () => ({ data: null, error: { message: SECRET } });
  const response = await api.webhookPost(request("whsec_syntheticLegacyOnly"));
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes(SECRET), false);
  assert.equal(f.businessCalls, 0);
});
