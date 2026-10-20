import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { build } from "esbuild";
import React, { act } from "react";
import { create, type ReactTestRenderer, type ReactTestInstance } from "react-test-renderer";
import type { Painting } from "../lib/types";

// Render the real checkout components, replacing only network/payment/router
// boundaries. These tests never connect to Stripe, Supabase, or the live site.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const requireFromProject = createRequire(path.join(process.cwd(), "package.json"));
const id = "b3cf010f-2bd5-4a45-a7fc-a0d1c82c0f4e";
const storageKey = "rm-checkout-v1";
const painting: Painting = {
  id: "art-one", slug: "first-painting", title: "First painting", year: 2026,
  series: "abstract", medium: "Acrylic on canvas", w: 20, h: 16,
  price: 500, status: "available", images: [{ url: "/painting.jpg", alt: "First painting" }],
};
const otherPainting = { ...painting, id: "art-two", slug: "second-painting", title: "Second painting" };
const form = { email: "buyer@example.com", name: "Test Buyer", address1: "100 Test Street", address2: "", city: "Austin", state: "TX", zip: "78701" };
const savedDraft = () => ({
  version: 1, reservationId: id, form, items: [{ id: painting.id, slug: painting.slug }],
  fingerprint: JSON.stringify({ ids: [painting.id], form }), summary: [painting],
});
const preparedResponse = () => ({
  clientSecret: "pi_test_secret_mock", reservationId: id, total: 625,
  expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  items: [{ ...painting, price: 625, status: "reserved" }],
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
type RequestRecord = { url: string; body: Record<string, unknown> };
type Harness = Awaited<ReturnType<typeof render>>;

async function render(file: "flow" | "success", options: {
  query?: string;
  initialDraft?: ReturnType<typeof savedDraft>;
  cart?: Painting[];
  request?: (request: RequestRecord, storage: Map<string, string>) => Response | Promise<Response>;
  confirm?: () => unknown | Promise<unknown>;
} = {}) {
  const requests: RequestRecord[] = [];
  const removed: string[][] = [];
  const navigations: string[] = [];
  const confirmedSecrets: string[] = [];
  const storage = new Map<string, string>();
  if (options.initialDraft) storage.set(storageKey, JSON.stringify(options.initialDraft));
  const mocks = {
    query: options.query ?? "",
    cart: {
      cart: options.cart ?? [painting], hydrated: true,
      removePurchased: (ids: string[]) => { removed.push(ids); },
    },
    router: { push: (url: string) => navigations.push(url), refresh() {} },
    stripe: {
      confirmCardPayment: async (secret: string) => {
        confirmedSecrets.push(secret);
        return options.confirm ? await options.confirm() : { paymentIntent: { status: "succeeded" } };
      },
    },
    elements: { getElement: () => ({}) },
  };
  const result = await build({
    entryPoints: [path.resolve(file === "flow" ? "components/checkout-flow.tsx" : "app/checkout/success/page.tsx")],
    bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic",
    external: ["react", "react/jsx-runtime"],
    define: { "process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": '"pk_test_ui_only"' },
    plugins: [{
      name: "checkout-test-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /^(next\/link|next\/navigation|@stripe\/react-stripe-js|@stripe\/stripe-js|.*cart-provider)$/ }, (args) => ({ path: args.path, namespace: "checkout-mock" }));
        builder.onLoad({ filter: /.*/, namespace: "checkout-mock" }, (args) => {
          if (args.path === "next/link") return { contents: 'import React from "react"; export default function Link({children, ...props}) { return React.createElement("a", props, children); }' };
          if (args.path === "next/navigation") return { contents: "export const useRouter = () => __uiMocks.router; export const useSearchParams = () => new URLSearchParams(__uiMocks.query);" };
          if (args.path.endsWith("cart-provider")) return { contents: "export const useCart = () => __uiMocks.cart;" };
          if (args.path === "@stripe/stripe-js") return { contents: "export const loadStripe = () => Promise.resolve(__uiMocks.stripe);" };
          return { contents: 'import React, { useEffect } from "react"; export const Elements = ({children}) => children; export const useStripe = () => __uiMocks.stripe; export const useElements = () => __uiMocks.elements; export function CardElement(props) { useEffect(() => { props.onReady?.({}); props.onChange?.({complete:true}); }, []); return React.createElement("div", {"data-testid":"card-element"}); }' };
        });
      },
    }],
  });
  const loaded = { exports: {} as { default: React.ComponentType } };
  vm.runInNewContext(result.outputFiles[0].text, {
    module: loaded, exports: loaded.exports, require: requireFromProject, __uiMocks: mocks,
    console, URLSearchParams, AbortController, setTimeout, clearTimeout,
    crypto: { randomUUID: () => id },
    window: { location: { origin: "https://checkout.example", assign: (url: string) => navigations.push(url) } },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    fetch: async (url: string, init: RequestInit) => {
      const request = { url, body: JSON.parse(init.body as string) as Record<string, unknown> };
      requests.push(request);
      if (options.request) return options.request(request, storage);
      return url === "/api/checkout" ? json(preparedResponse()) : json({ status: "pending" });
    },
  });
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(loaded.exports.default));
    await new Promise((resolve) => setImmediate(resolve));
  });
  return {
    renderer: renderer!, requests, removed, navigations, confirmedSecrets, storage,
    async close() { await act(async () => renderer.unmount()); },
  };
}

function textOf(node: ReactTestInstance | string): string {
  return typeof node === "string" ? node : node.children.map(textOf).join("");
}

async function click(harness: Harness, label: string) {
  const button = harness.renderer.root.findAllByType("button").find((node) => textOf(node) === label);
  assert.ok(button, `Button missing: ${label}`);
  assert.ok(!button.props.disabled, `Button disabled: ${label}`);
  await act(async () => {
    button.props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
  });
}

async function fill(harness: Harness, values: string[]) {
  await act(async () => {
    const inputs = harness.renderer.root.findAllByType("input");
    assert.equal(inputs.length, values.length);
    inputs.forEach((input, index) => input.props.onChange({ target: { value: values[index] } }));
  });
}

async function enterDelivery(harness: Harness) {
  await fill(harness, [form.email, form.name]);
  await click(harness, "Continue to delivery");
  await fill(harness, [form.address1, form.address2, form.city, form.state, form.zip]);
}

test("success page without a valid reference never claims payment or clears a cart", async () => {
  const harness = await render("success");
  try {
    assert.match(textOf(harness.renderer.root), /We need your checkout link/);
    assert.equal(harness.requests.length, 0);
    assert.deepEqual(harness.removed, []);
    assert.doesNotMatch(textOf(harness.renderer.root), /Payment received|Order placed|confirmation has been sent/);
  } finally { await harness.close(); }
});

for (const status of ["pending", "processing"] as const) {
  test(`${status} payment remains unconfirmed and keeps every cart item`, async () => {
    const harness = await render("success", { query: `reservation_id=${id}`, request: () => json({ status }) });
    try {
      assert.deepEqual(harness.removed, []);
      assert.doesNotMatch(textOf(harness.renderer.root), /Payment received|Thank you\./);
      assert.match(textOf(harness.renderer.root), status === "processing" ? /payment is still processing/ : /Payment has not completed/);
    } finally { await harness.close(); }
  });
}

test("only server-verified payment removes the exact purchased paintings", async () => {
  const harness = await render("success", {
    query: `reservation_id=${id}`, initialDraft: savedDraft(), cart: [painting, otherPainting],
    request: () => json({ status: "paid", paintingIds: [painting.id], orderRef: "ORDER-CONFIRMED-1" }),
  });
  try {
    assert.equal(harness.removed.length, 1);
    assert.deepEqual(Array.from(harness.removed[0]), [painting.id]);
    assert.ok(!harness.removed[0].includes(otherPainting.id));
    assert.match(textOf(harness.renderer.root), /Payment received/);
    assert.equal(harness.storage.has(storageKey), false);
  } finally { await harness.close(); }
});

test("a lost prepare response shows an error at delivery and retries the same saved reservation", async () => {
  let prepares = 0;
  const harness = await render("flow", {
    request: (request, storage) => {
      if (request.url === "/api/checkout") {
        assert.equal(JSON.parse(storage.get(storageKey)!).reservationId, id, "reference must be durable before POST");
        if (++prepares === 1) throw new Error("Connection lost");
        return json(preparedResponse());
      }
      return json({ error: "Checkout not found." }, 404);
    },
  });
  try {
    await enterDelivery(harness);
    await click(harness, "Continue to payment");
    assert.match(textOf(harness.renderer.root.findByProps({ role: "alert" })), /checkout is saved so you can retry safely/);
    assert.equal(JSON.parse(harness.storage.get(storageKey)!).reservationId, id);
    await click(harness, "Continue to payment");
    const prepared = harness.requests.filter((request) => request.url === "/api/checkout");
    assert.equal(prepared.length, 2);
    assert.ok(prepared.every((request) => request.body.reservationId === id));
    assert.match(textOf(harness.renderer.root), /Pay securely · \$625/);
    assert.doesNotMatch(harness.storage.get(storageKey)!, /clientSecret|pi_test_secret_mock/);
  } finally { await harness.close(); }
});

test("refresh resumes the saved checkout rather than creating a new payment", async () => {
  const harness = await render("flow", { initialDraft: savedDraft() });
  try {
    const prepared = harness.requests.filter((request) => request.url === "/api/checkout");
    assert.equal(prepared.length, 1);
    assert.equal(prepared[0].body.reservationId, id);
    assert.match(textOf(harness.renderer.root), /Pay securely · \$625/);
  } finally { await harness.close(); }
});

test("contact fields stay frozen until the server confirms cancellation", async () => {
  let release: ((response: Response) => void) | undefined;
  const harness = await render("flow", {
    initialDraft: savedDraft(),
    request: (request) => request.url === "/api/checkout/cancel"
      ? new Promise<Response>((resolve) => { release = resolve; })
      : json(preparedResponse()),
  });
  try {
    await click(harness, "Contact");
    assert.ok(release);
    assert.equal(harness.renderer.root.findAllByType("input").length, 0);
    assert.ok(harness.storage.has(storageKey));
    await act(async () => {
      release!(json({ status: "released" }));
      await new Promise((resolve) => setImmediate(resolve));
    });
    assert.equal(harness.renderer.root.findAllByType("input").length, 2);
    assert.ok(harness.renderer.root.findAllByType("input").every((input) => !input.props.disabled));
    assert.equal(harness.storage.has(storageKey), false);
  } finally { await harness.close(); }
});

test("an in-flight payment wins cancellation and sends the buyer to verification", async () => {
  const harness = await render("flow", {
    initialDraft: savedDraft(),
    request: (request) => request.url === "/api/checkout/cancel"
      ? json({ status: "processing" }) : json(preparedResponse()),
  });
  try {
    await click(harness, "Contact");
    assert.deepEqual(harness.navigations, [`/checkout/success?reservation_id=${id}`]);
    assert.ok(harness.storage.has(storageKey));
    assert.deepEqual(harness.removed, []);
  } finally { await harness.close(); }
});

test("Stripe processing returns to server verification without clearing the cart", async () => {
  const harness = await render("flow", {
    initialDraft: savedDraft(), confirm: () => ({ paymentIntent: { status: "processing" } }),
    request: (request) => request.url === "/api/checkout/status" ? json({ status: "pending" }) : json(preparedResponse()),
  });
  try {
    await act(async () => {
      harness.renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
      await new Promise((resolve) => setImmediate(resolve));
    });
    assert.deepEqual(harness.confirmedSecrets, ["pi_test_secret_mock"]);
    assert.deepEqual(harness.navigations, [`/checkout/success?reservation_id=${id}`]);
    assert.deepEqual(harness.removed, []);
    assert.ok(harness.storage.has(storageKey));
  } finally { await harness.close(); }
});

test("uncertain cancellation keeps the saved checkout and prevents editing", async () => {
  const harness = await render("flow", {
    initialDraft: savedDraft(),
    request: (request) => {
      if (request.url === "/api/checkout/cancel") throw new Error("Connection lost");
      if (request.url === "/api/checkout/status") return json({ status: "pending" });
      return json(preparedResponse());
    },
  });
  try {
    await click(harness, "Contact");
    assert.equal(harness.renderer.root.findAllByType("input").length, 0);
    assert.equal(JSON.parse(harness.storage.get(storageKey)!).reservationId, id);
    assert.ok(harness.renderer.root.findByProps({ role: "alert" }));
    assert.deepEqual(harness.navigations, []);
    assert.deepEqual(harness.removed, []);
  } finally { await harness.close(); }
});

test("a released reservation cannot reach Stripe confirmation", async () => {
  const harness = await render("flow", {
    initialDraft: savedDraft(),
    request: (request) => request.url === "/api/checkout/status" ? json({ status: "released" }) : json(preparedResponse()),
  });
  try {
    await act(async () => {
      harness.renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
      await new Promise((resolve) => setImmediate(resolve));
    });
    assert.deepEqual(harness.confirmedSecrets, []);
    assert.deepEqual(harness.navigations, []);
    assert.deepEqual(harness.removed, []);
    assert.ok(harness.renderer.root.findByProps({ role: "alert" }));
    const pay = harness.renderer.root.findAllByType("button").find((node) => textOf(node).startsWith("Pay securely"));
    assert.ok(pay?.props.disabled);
  } finally { await harness.close(); }
});
