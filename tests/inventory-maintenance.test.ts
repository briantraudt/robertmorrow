// Runs the production migration/audit workflow against isolated provider ports.
// The SQL and orchestration suites cover the transactional fulfillment itself.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";

let api: any;
const originalFetch = globalThis.fetch;

before(async () => {
  globalThis.fetch = async () => { throw new Error("Network is disabled in maintenance tests."); };
  const root = process.cwd();
  const stubs: Record<string, string> = {
    "test-ports": "export const ports = {}; export function configurePorts(next) { for (const key of Object.keys(ports)) delete ports[key]; Object.assign(ports, next); }",
    "server-only": "export {};",
    "next/cache": "export function revalidatePath() {}",
    "test-stripe": 'import {ports} from "test-ports"; export function getStripe() { return ports.stripe; }',
    "test-database": 'import {ports} from "test-ports"; export function createServerSupabaseClient() { return ports.db; }',
    "test-inventory": `import {ports} from "test-ports";
      export {paintingIdsFromMetadata} from ${JSON.stringify(resolve(root, "lib/inventory.ts"))};
      export async function finalizePayment(intent) { ports.calls.push(["sale", intent.id]); return {status:ports.ignoredTests.has(intent.id) ? "released" : "paid"}; }
      export async function finalizeSession(session) { ports.calls.push(["session-sale", session.id]); return {status:ports.ignoredTests.has(session.id) ? "released" : "paid"}; }
      export async function ensureCartPayment() { throw new Error("Unexpected recovery"); }
      export async function ensureOfferSession() { throw new Error("Unexpected recovery"); }
      export async function reconcileExpiredInventory() { throw new Error("Unexpected recovery"); }`,
  };
  const result = await build({
    stdin: {
      contents: `export {configurePorts} from "test-ports"; export * from ${JSON.stringify(resolve(root, "lib/inventory-maintenance.ts"))};`,
      sourcefile: "maintenance-test-entry.ts", resolveDir: root, loader: "ts",
    },
    bundle: true, write: false, platform: "node", format: "cjs", logLevel: "silent",
    plugins: [{ name: "maintenance-test-ports", setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        let id = args.path;
        if (id === "./stripe") id = "test-stripe";
        if (id === "./supabase/server") id = "test-database";
        if (id === "./inventory") id = "test-inventory";
        if (id in stubs) return { path: id, namespace: "test-port" };
      });
      builder.onLoad({ filter: /.*/, namespace: "test-port" }, (args) => ({ contents: stubs[args.path], loader: "js", resolveDir: root }));
    } }],
  });
  const target = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(resolve(root, "package.json")), target, target.exports);
  api = target.exports;
});

after(() => { globalThis.fetch = originalFetch; });

const metadata = { painting_ids: "original-one" };
const reservedMetadata = { ...metadata, reservation_id: "11111111-1111-4111-8111-111111111111" };
const intent = (id: string, status = "requires_payment_method", meta = metadata) => ({ id, status, metadata: meta });
const session = (id: string, overrides: Record<string, unknown> = {}) => ({ id, status: "open", payment_status: "unpaid", payment_intent: null, metadata, ...overrides });

function fixture(input: { intents?: any[]; sessions?: any[]; links?: any[]; endpoints?: any[] } = {}) {
  const records = { intents: [], sessions: [], links: [], endpoints: [], ...input };
  const calls: any[][] = [];
  const failures = new Set<string>();
  const ignoredTests = new Set<string>();
  const changed = new Map<string, any>();
  const list = (kind: keyof typeof records) => async (params: any) => {
    calls.push(["list", kind, structuredClone(params)]);
    const rows = records[kind].filter((row) => params.active === undefined || row.active === params.active);
    const start = params.starting_after ? rows.findIndex((row) => row.id === params.starting_after) + 1 : 0;
    assert.ok(start >= 0);
    return { data: structuredClone(rows.slice(start, start + params.limit)), has_more: rows.length > start + params.limit };
  };
  const ports: any = {
    calls, ignoredTests,
    db: { from(name: string) {
      return { async select() {
        if (name === "paintings") return { data: [{ id: "original-one" }, { id: "original-two" }], error: null };
        assert.equal(name, "orders");
        return { count: 0, error: null };
      } };
    } },
    stripe: {
      paymentLinks: {
        list: list("links"),
        async update(id: string, fields: any) {
          calls.push(["disable", id]);
          if (failures.has(id)) throw new Error("Synthetic provider failure");
          const row = records.links.find((l) => l.id === id)!;
          Object.assign(row, fields); return structuredClone(row);
        },
      },
      checkout: { sessions: {
        list: list("sessions"),
        async expire(id: string) {
          calls.push(["expire", id]);
          if (failures.has(id)) throw new Error("Synthetic provider failure");
          return structuredClone(changed.get(id) ?? session(id, { status: "expired" }));
        },
        async retrieve(id: string) { calls.push(["session-retrieve", id]); return structuredClone(changed.get(id) ?? records.sessions.find((s) => s.id === id)); },
      } },
      paymentIntents: {
        list: list("intents"),
        async cancel(id: string) {
          calls.push(["cancel", id]);
          if (failures.has(id)) throw new Error("Synthetic provider failure");
          return structuredClone(changed.get(id) ?? intent(id, "canceled"));
        },
        async retrieve(id: string) { calls.push(["intent-retrieve", id]); return structuredClone(changed.get(id) ?? records.intents.find((p) => p.id === id)); },
      },
      webhookEndpoints: { list: list("endpoints") },
    },
  };
  api.configurePorts(ports);
  return { calls, failures, changed, records, ignoredTests };
}

test("audit pages past 100 records and consistently excludes reservation-backed attempts", async () => {
  const f = fixture({
    intents: [...Array.from({ length: 100 }, (_, i) => intent(`pi_${i}`, "canceled")), intent("pi_older"), intent("pi_new", "processing", reservedMetadata)],
    sessions: [session("cs_processing", { status: "complete" }), session("cs_new", { metadata: reservedMetadata })],
    links: [{ id: "plink_old", active: true, metadata }, { id: "plink_new", active: true, metadata: reservedMetadata }],
    endpoints: [{ id: "we_site", url: "https://www.robertmorrow.art/api/webhook", status: "enabled", enabled_events: ["payment_intent.succeeded"] }],
  });
  const audit = await api.auditPayments();
  assert.equal(audit.legacyPayableIntents, 1);
  assert.equal(audit.legacyOpenSessions, 0);
  assert.equal(audit.legacyProcessingSessions, 1);
  assert.equal(audit.activeLegacyPaymentLinks, 1);
  assert.equal(audit.scanned.paymentIntents, 102);
  assert.equal(audit.moreProviderHistory, false);
  assert.deepEqual(f.calls.filter(([kind, resource]) => kind === "list" && resource === "intents").map((c) => c[2]), [{ limit: 100 }, { limit: 100, starting_after: "pi_99" }]);
  assert.ok(f.calls.every(([kind]) => kind === "list"));
});

test("reconciliation closes older links before sessions, cancels only known legacy attempts, and reports processing artwork", async () => {
  const f = fixture({
    links: [...Array.from({ length: 100 }, (_, i) => ({ id: `plink_${i}`, active: true, metadata: {} })), { id: "plink_older", active: true, metadata }, { id: "plink_reserved", active: true, metadata: reservedMetadata }],
    sessions: [...Array.from({ length: 100 }, (_, i) => session(`cs_${i}`, { status: "expired", metadata: {} })), session("cs_older"), session("cs_reserved", { metadata: reservedMetadata }), session("cs_processing", { status: "complete", payment_intent: "pi_session_processing", metadata: { painting_ids: "original-two" } }), session("cs_paid", { status: "complete", payment_status: "paid", payment_intent: "pi_session_paid" })],
    intents: [...Array.from({ length: 100 }, (_, i) => intent(`pi_${i}`, "canceled")), intent("pi_older"), intent("pi_reserved", "requires_action", reservedMetadata), intent("pi_unrelated", "requires_action", { painting_ids: "different-site" }), intent("pi_processing", "processing"), intent("pi_paid", "succeeded"), intent("pi_session_processing", "processing"), intent("pi_session_paid", "succeeded")],
  });
  const result = await api.reconcileLegacyPayments();
  assert.deepEqual({ ...result, scanned: undefined }, { linksDisabled: 1, sessionsExpired: 1, intentsCanceled: 1, salesRecorded: 2, testSalesIgnored: 0, processingRetained: 2, errors: 0, historyIncomplete: false, processingPaintingIds: ["original-one", "original-two"], scanned: undefined });
  const mutations = f.calls.filter(([kind]) => kind !== "list");
  assert.deepEqual(mutations, [["disable", "plink_older"], ["expire", "cs_older"], ["session-sale", "cs_paid"], ["cancel", "pi_older"], ["sale", "pi_paid"]]);
  const lastLinksPage = f.calls.findIndex((c) => c[0] === "list" && c[1] === "links" && c[2].starting_after);
  assert.ok(lastLinksPage < f.calls.findIndex((c) => c[0] === "disable"), "Finish paging active links before changing the filtered set.");
});

test("retired test payments are counted separately from real sales, including completion races", async () => {
  const f = fixture({
    sessions: [session("cs_test_paid", { status: "complete", payment_status: "paid", payment_intent: "pi_test_session" }), session("cs_test_racing")],
    intents: [intent("pi_test_direct", "succeeded"), intent("pi_real_paid", "succeeded"), intent("pi_test_session", "succeeded"), intent("pi_test_session_racing", "succeeded"), intent("pi_test_racing")],
  });
  for (const id of ["cs_test_paid", "cs_test_racing", "pi_test_direct", "pi_test_racing"]) f.ignoredTests.add(id);
  f.changed.set("cs_test_racing", session("cs_test_racing", { status: "complete", payment_status: "paid", payment_intent: "pi_test_session_racing" }));
  f.changed.set("pi_test_racing", intent("pi_test_racing", "succeeded"));
  const result = await api.reconcileLegacyPayments();
  assert.equal(result.salesRecorded, 1);
  assert.equal(result.testSalesIgnored, 4);
  assert.equal(result.errors, 0);
  assert.equal(result.processingRetained, 0);
  assert.equal(result.intentsCanceled, 0);
  assert.equal(result.sessionsExpired, 0);
  assert.equal(f.calls.filter(([kind]) => kind === "sale" || kind === "session-sale").length, 5);
});

test("the 1,000-record cap explicitly blocks an apparently empty audit and incomplete migration", async () => {
  const f = fixture({ intents: [...Array.from({ length: 1000 }, (_, i) => intent(`pi_${i}`, "canceled")), intent("pi_older_than_cap")] });
  const audit = await api.auditPayments();
  assert.equal(audit.legacyPayableIntents, 0);
  assert.equal(audit.scanned.paymentIntents, 1000);
  assert.equal(audit.moreProviderHistory, true);
  const result = await api.reconcileLegacyPayments();
  assert.equal(result.historyIncomplete, true);
  assert.equal(result.intentsCanceled, 0);
  assert.equal(f.calls.filter((c) => c[0] === "list" && c[1] === "intents").length, 20);
});

test("completion winning expiry or cancellation is fulfilled once and never counted as canceled", async () => {
  const f = fixture({ sessions: [session("cs_racing")], intents: [intent("pi_session_racing", "succeeded"), intent("pi_direct_racing")] });
  f.failures.add("cs_racing"); f.failures.add("pi_direct_racing");
  f.changed.set("cs_racing", session("cs_racing", { status: "complete", payment_status: "paid", payment_intent: "pi_session_racing" }));
  f.changed.set("pi_direct_racing", intent("pi_direct_racing", "succeeded"));
  const result = await api.reconcileLegacyPayments();
  assert.equal(result.salesRecorded, 2);
  assert.equal(result.sessionsExpired, 0);
  assert.equal(result.intentsCanceled, 0);
  assert.equal(result.processingRetained, 0);
  assert.deepEqual(f.calls.filter(([kind]) => ["sale", "session-sale", "cancel"].includes(kind)), [["session-sale", "cs_racing"], ["cancel", "pi_direct_racing"], ["sale", "pi_direct_racing"]]);
});

test("malformed references and provider errors remain visible without stopping unrelated safe cleanup", async () => {
  const f = fixture({
    links: [{ id: "plink_failure", active: true, metadata }, { id: "plink_good", active: true, metadata }],
    sessions: [session("cs_invalid", { metadata: { painting_ids: "original-one,original-one" } })],
    intents: [intent("pi_invalid", "requires_payment_method", { painting_ids: "bad id" }), intent("pi_good")],
  });
  f.failures.add("plink_failure");
  const result = await api.reconcileLegacyPayments();
  assert.equal(result.errors, 3);
  assert.equal(result.linksDisabled, 1);
  assert.equal(result.intentsCanceled, 1);
  assert.ok(!f.calls.some((c) => c[0] === "cancel" && c[1] === "pi_invalid"));
});

test("elapsed operator budget reports an incomplete migration instead of claiming success", async () => {
  const realNow = Date.now;
  let clock = 0;
  Date.now = () => clock;
  try {
    const f = fixture({ links: [{ id: "plink_late", active: true, metadata }] });
    // Advancing after the first provider response leaves no time for mutations.
    const originalClone = globalThis.structuredClone;
    globalThis.structuredClone = ((value: unknown) => { clock = 46_000; return originalClone(value); }) as typeof structuredClone;
    try {
      const result = await api.reconcileLegacyPayments();
      assert.equal(result.historyIncomplete, true);
      assert.equal(result.linksDisabled, 0);
      assert.ok(f.calls.every(([kind]) => kind === "list"));
    } finally { globalThis.structuredClone = originalClone; }
  } finally { Date.now = realNow; }
});
