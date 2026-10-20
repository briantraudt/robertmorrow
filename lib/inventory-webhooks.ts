import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { getStripe } from "./stripe";
import { createServerSupabaseClient } from "./supabase/server";

const INVENTORY_URL = "https://www.robertmorrow.art/api/webhook";
const LEGACY_URL = "https://robertmorrow.art/api/webhook";
const SITE = "robertmorrow.art";
const PURPOSE = "inventory-v1";
const API_VERSION = "2025-02-24.acacia";
const INSTALL_KEY = "rm-inventory-webhook-2026-10-20";
const EVENTS = [
  "payment_intent.succeeded",
  "payment_intent.canceled",
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_succeeded",
] as const;
const LEGACY_IDS = ["we_1TQZJaPORrohA5Kj5sbkBsG4", "we_1TQZ3QPORrohA5Kj5i3gCgsC"] as const;
const ENDPOINT_ID = /^we_[a-zA-Z0-9]{1,100}$/;

export type InventoryWebhookSummary = { id: string; url: string; status: string; events: string[] };
type StoredWebhook = { id: string; secret: string; verified_at: string | null };

async function vaultRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  // Database/provider errors may contain request values. Never log or attach
  // their raw responses when the request can include a signing secret.
  try {
    const { data, error } = await createServerSupabaseClient().rpc(name, args);
    if (error) throw new Error();
    return data as T;
  } catch {
    throw new Error("Inventory webhook settings could not be accessed.");
  }
}

async function getStoredWebhook(): Promise<StoredWebhook | null> {
  const data = await vaultRpc<StoredWebhook | null>("rm_get_inventory_webhook");
  if (data === null) return null;
  if (!data || typeof data.id !== "string" || !ENDPOINT_ID.test(data.id) || isLegacyId(data.id)
    || typeof data.secret !== "string" || !/^whsec_[a-zA-Z0-9]+$/.test(data.secret)
    || (data.verified_at !== null && (typeof data.verified_at !== "string" || !Number.isFinite(Date.parse(data.verified_at))))) {
    throw new Error("Stored inventory webhook configuration is invalid.");
  }
  return { id: data.id, secret: data.secret, verified_at: data.verified_at };
}

// Internal handler use only. Database errors must fail closed: falling back
// during an outage could reject deliveries from the installed endpoint.
export async function getInventoryWebhookSecret(): Promise<string | undefined> {
  const stored = await getStoredWebhook();
  return stored ? stored.secret : process.env.STRIPE_WEBHOOK_SECRET;
}

function summary(endpoint: Stripe.WebhookEndpoint): InventoryWebhookSummary {
  return { id: endpoint.id, url: endpoint.url, status: endpoint.status, events: [...endpoint.enabled_events] };
}

function isLegacyId(id: string) {
  return LEGACY_IDS.some((legacyId) => legacyId === id);
}

function verifyReplacement(endpoint: Stripe.WebhookEndpoint, expectedId?: string) {
  if (endpoint.object !== "webhook_endpoint" || !ENDPOINT_ID.test(endpoint.id)
    || isLegacyId(endpoint.id) || (expectedId && endpoint.id !== expectedId)
    || endpoint.status !== "enabled" || endpoint.url !== INVENTORY_URL
    || endpoint.api_version !== API_VERSION
    || endpoint.metadata?.site !== SITE || endpoint.metadata?.purpose !== PURPOSE
    || endpoint.enabled_events.length !== EVENTS.length
    || !EVENTS.every((event) => endpoint.enabled_events.includes(event))) {
    throw new Error("The replacement inventory webhook configuration could not be verified.");
  }
}

function verifyLegacy(endpoint: Stripe.WebhookEndpoint, expectedId: string, livemode: boolean) {
  let allowedUrl = false;
  try {
    const url = new URL(endpoint.url);
    allowedUrl = url.protocol === "https:" && ["robertmorrow.art", "www.robertmorrow.art"].includes(url.hostname)
      && !url.username && !url.password && !url.port && !url.search && !url.hash && url.pathname === "/api/webhook";
  } catch { /* An invalid URL must never be eligible for retirement. */ }
  if (endpoint.object !== "webhook_endpoint" || endpoint.id !== expectedId || !isLegacyId(endpoint.id)
    || endpoint.url !== LEGACY_URL || !allowedUrl || endpoint.livemode !== livemode
    || !["enabled", "disabled"].includes(endpoint.status)) {
    throw new Error(`Legacy webhook ${expectedId} no longer matches the audited endpoint. No further endpoints were disabled.`);
  }
}

// The signing secret travels directly from Stripe to encrypted server-side
// storage. No operator response, logging or diagnostic output contains it.
export async function installInventoryWebhook(): Promise<InventoryWebhookSummary & { stored: true }> {
  if (process.env.INVENTORY_CHECKOUT_ENABLED === "true") {
    throw new Error("Pause inventory checkout before installing its webhook.");
  }
  const stored = await getStoredWebhook();
  if (stored) {
    const endpoint = await getStripe().webhookEndpoints.retrieve(stored.id);
    verifyReplacement(endpoint, stored.id);
    return { ...summary(endpoint), stored: true };
  }
  const endpoint = await getStripe().webhookEndpoints.create({
    url: INVENTORY_URL,
    enabled_events: [...EVENTS],
    api_version: API_VERSION,
    connect: false,
    metadata: { site: SITE, purpose: PURPOSE },
    description: "Robert Morrow painting inventory and payment fulfillment",
  }, { idempotencyKey: INSTALL_KEY });
  verifyReplacement(endpoint);
  if (typeof endpoint.secret !== "string" || !/^whsec_[a-zA-Z0-9]+$/.test(endpoint.secret)) {
    throw new Error("Stripe did not return the new webhook signing secret. Checkout must remain paused until it is securely configured.");
  }
  const result = await vaultRpc<{ id: string; stored: boolean }>("rm_store_inventory_webhook", {
    p_endpoint_id: endpoint.id, p_secret: endpoint.secret,
  });
  if (result?.id !== endpoint.id || result.stored !== true) throw new Error("Webhook storage could not be confirmed.");
  return { ...summary(endpoint), stored: true };
}

export async function verifyInventoryWebhook(): Promise<{ verified: true; id: string }> {
  const stored = await getStoredWebhook();
  if (!stored) throw new Error("Install and store the inventory webhook before verification.");
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    id: `evt_inventory_verification_${randomUUID()}`,
    object: "event", type: "inventory.verification", created: timestamp,
    data: { object: {} },
  });
  const signature = createHmac("sha256", stored.secret).update(`${timestamp}.${payload}`).digest("hex");
  try {
    const response = await fetch(INVENTORY_URL, {
      method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` },
      body: payload, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (response.status !== 200 || (await response.json())?.received !== true) throw new Error();
  } catch {
    throw new Error("The inventory webhook did not acknowledge its signed verification event.");
  }
  const verified = await vaultRpc<{ id: string }>("rm_verify_inventory_webhook", { p_endpoint_id: stored.id });
  if (verified?.id !== stored.id) throw new Error("Webhook verification could not be recorded.");
  return { verified: true, id: stored.id };
}

// Call after deploying and verifying the replacement signing secret. Checkout
// may already be enabled; retirement deliberately has no installation gate.
export async function retireLegacyWebhooks(replacementId: string): Promise<{
  replacement: InventoryWebhookSummary;
  retired: InventoryWebhookSummary[];
  alreadyDisabled: InventoryWebhookSummary[];
}> {
  if (typeof replacementId !== "string" || !ENDPOINT_ID.test(replacementId) || isLegacyId(replacementId)) {
    throw new Error("A distinct replacement webhook reference is required.");
  }
  const stored = await getStoredWebhook();
  if (!stored || stored.id !== replacementId || !stored.verified_at) {
    throw new Error("The stored replacement webhook must be verified before retiring legacy endpoints.");
  }
  const stripe = getStripe();
  const replacement = await stripe.webhookEndpoints.retrieve(replacementId);
  verifyReplacement(replacement, replacementId);

  // Validate both known records before making either write. No endpoint list or
  // domain-wide matching can accidentally select an unrelated integration.
  const legacy = await Promise.all(LEGACY_IDS.map((id) => stripe.webhookEndpoints.retrieve(id)));
  legacy.forEach((endpoint, index) => verifyLegacy(endpoint, LEGACY_IDS[index], replacement.livemode));
  const retired: InventoryWebhookSummary[] = [];
  const alreadyDisabled: InventoryWebhookSummary[] = [];
  for (const endpoint of legacy) {
    if (endpoint.status === "disabled") {
      alreadyDisabled.push(summary(endpoint));
      continue;
    }
    const disabled = await stripe.webhookEndpoints.update(endpoint.id, { disabled: true }, {
      idempotencyKey: `rm-retire-webhook-${replacementId}-${endpoint.id}`,
    });
    verifyLegacy(disabled, endpoint.id, replacement.livemode);
    if (disabled.status !== "disabled") throw new Error(`Stripe did not confirm disabling legacy webhook ${endpoint.id}.`);
    retired.push(summary(disabled));
  }
  return { replacement: summary(replacement), retired, alreadyDisabled };
}
