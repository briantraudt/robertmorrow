import "server-only";
import type Stripe from "stripe";
import { getStripe } from "./stripe";
import { createServerSupabaseClient } from "./supabase/server";
import { finalizePayment, finalizeSession, paintingIdsFromMetadata, ensureCartPayment, ensureOfferSession, reconcileExpiredInventory, type Reservation } from "./inventory";

export async function recoverInventory() {
  const supabase = createServerSupabaseClient();
  const pending = await supabase.from("inventory_reservations").select("*").eq("status", "pending").lte("created_at", new Date(Date.now() - 60000).toISOString()).limit(25);
  if (pending.error) throw pending.error;
  const recovered = { bound: 0, errors: 0 };
  for (const raw of pending.data ?? []) {
    const r = raw as Reservation;
    try { if (r.kind === "cart") await ensureCartPayment(r); else await ensureOfferSession(r); recovered.bound++; }
    catch (e) { recovered.errors++; console.error("[inventory:pending]", r.id, e instanceof Error ? e.message : "Recovery failed"); }
  }
  return { pending: recovered, expired: await reconcileExpiredInventory() };
}

const HISTORY_PAGE_SIZE = 100;
const HISTORY_MAX_PAGES = 10;
const MAINTENANCE_BUDGET_MS = 45_000;

// Never call an incomplete first page a complete audit. The cap keeps operator
// requests bounded; hitting it (or the time budget) blocks a safe cutover.
async function collectHistory<T extends { id: string }>(
  list: (params: { limit: number; starting_after?: string }) => PromiseLike<{ data: T[]; has_more: boolean }>,
  deadline: number,
) {
  const data: T[] = [];
  let starting_after: string | undefined;
  for (let page = 0; page < HISTORY_MAX_PAGES && Date.now() < deadline; page++) {
    const result = await list({ limit: HISTORY_PAGE_SIZE, ...(starting_after ? { starting_after } : {}) });
    data.push(...result.data);
    if (!result.has_more) return { data, has_more: false };
    const next = result.data.at(-1)?.id;
    if (!next || next === starting_after) return { data, has_more: true };
    starting_after = next;
  }
  return { data, has_more: true };
}

// A bounded operator-only audit supports the release and future reconciliation.
// No buyer identities, addresses, client secrets or provider keys are returned.
export async function auditPayments() {
  const stripe = getStripe();
  const supabase = createServerSupabaseClient();
  const deadline = Date.now() + MAINTENANCE_BUDGET_MS;
  const [intents, sessions, links, endpoints, counts] = await Promise.all([
    collectHistory((params) => stripe.paymentIntents.list(params), deadline),
    collectHistory((params) => stripe.checkout.sessions.list(params), deadline),
    collectHistory((params) => stripe.paymentLinks.list({ ...params, active: true }), deadline),
    collectHistory((params) => stripe.webhookEndpoints.list(params), deadline),
    supabase.from("orders").select("id", { count: "exact", head: true }),
  ]);
  if (counts.error) throw counts.error;
  const relevantIntents = intents.data.filter((p) => p.metadata.painting_ids);
  const relevantSessions = sessions.data.filter((s) => s.metadata?.painting_ids);
  const relevantLinks = links.data.filter((l) => l.metadata?.painting_ids);
  const summarize = (items: { status: string | null }[]) => items.reduce<Record<string, number>>((counts, row) => { const key = row.status ?? "unknown"; counts[key] = (counts[key] ?? 0) + 1; return counts; }, {});
  return {
    orders: counts.count, paymentIntents: summarize(relevantIntents), checkoutSessions: summarize(relevantSessions),
    legacyPayableIntents: relevantIntents.filter((p) => !p.metadata.reservation_id && !["succeeded", "canceled"].includes(p.status)).length,
    legacyOpenSessions: relevantSessions.filter((s) => !s.metadata?.reservation_id && s.status === "open").length,
    legacyProcessingSessions: relevantSessions.filter((s) => !s.metadata?.reservation_id && s.status === "complete" && s.payment_status !== "paid").length,
    activeLegacyPaymentLinks: relevantLinks.filter((l) => !l.metadata?.reservation_id).length,
    moreProviderHistory: intents.has_more || sessions.has_more || links.has_more || endpoints.has_more,
    scanned: { paymentIntents: intents.data.length, checkoutSessions: sessions.data.length, activePaymentLinks: links.data.length, webhookEndpoints: endpoints.data.length },
    webhooks: endpoints.data.filter((e) => { try { return ["www.robertmorrow.art", "robertmorrow.art"].includes(new URL(e.url).hostname); } catch { return false; } }).map((e) => ({ id: e.id, url: e.url, status: e.status, events: e.enabled_events })),
    configuration: { stripe: !!process.env.STRIPE_SECRET_KEY, webhook: !!process.env.STRIPE_WEBHOOK_SECRET, database: !!process.env.SUPABASE_SERVICE_ROLE_KEY, email: !!process.env.RESEND_API_KEY, cron: !!process.env.CRON_SECRET, livePayments: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false, checkoutEnabled: process.env.INVENTORY_CHECKOUT_ENABLED === "true", canonicalSite: process.env.NEXT_PUBLIC_SITE_URL },
  };
}

// Removes only unpaid, pre-reservation payment attempts for known site artwork.
// Successful historical payments are reconciled; processing payments remain
// untouched and are explicitly reported for review. No refunds or charges.
export async function reconcileLegacyPayments() {
  const stripe = getStripe();
  const deadline = Date.now() + MAINTENANCE_BUDGET_MS;
  const known = await createServerSupabaseClient().from("paintings").select("id");
  if (known.error) throw known.error;
  const knownIds = new Set((known.data ?? []).map((p) => p.id));
  const belongsToSite = (metadata: Stripe.Metadata | null | undefined) => { const ids = paintingIdsFromMetadata(metadata); return ids.length > 0 && ids.every((id) => knownIds.has(id)); };
  const counts = { linksDisabled: 0, sessionsExpired: 0, intentsCanceled: 0, salesRecorded: 0, processingRetained: 0, errors: 0, historyIncomplete: false };
  const processingPaintingIds = new Set<string>();
  const retainProcessing = (metadata: Stripe.Metadata | null | undefined) => {
    counts.processingRetained++;
    for (const id of paintingIdsFromMetadata(metadata)) processingPaintingIds.add(id);
  };
  const outOfTime = () => {
    if (Date.now() < deadline) return false;
    counts.historyIncomplete = true;
    return true;
  };
  // First close legacy offer links so they cannot start any more sessions.
  // Collect before changing active=true, so mutations cannot disturb pagination.
  const links = await collectHistory((params) => stripe.paymentLinks.list({ ...params, active: true }), deadline);
  counts.historyIncomplete ||= links.has_more;
  for (const link of links.data) {
    if (outOfTime()) break;
    try {
      if (link.metadata?.reservation_id || !belongsToSite(link.metadata)) continue;
      await stripe.paymentLinks.update(link.id, { active: false }); counts.linksDisabled++;
    } catch { counts.errors++; }
  }
  const sessions = await collectHistory((params) => stripe.checkout.sessions.list(params), deadline);
  counts.historyIncomplete ||= sessions.has_more;
  const sessionIntentIds = new Set<string>();
  for (let session of sessions.data) {
    if (outOfTime()) break;
    try {
      if (session.metadata?.reservation_id || !belongsToSite(session.metadata)) continue;
      const rememberIntent = () => {
        const id = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
        if (id) sessionIntentIds.add(id);
      };
      rememberIntent();
      if (session.payment_status === "paid") { await finalizeSession(session); counts.salesRecorded++; }
      else if (session.status === "open") {
        try { session = await stripe.checkout.sessions.expire(session.id); }
        catch { session = await stripe.checkout.sessions.retrieve(session.id); }
        // Completion can win the race with expiry and attach a new intent.
        rememberIntent();
        if (session.status === "expired") counts.sessionsExpired++;
        else if (session.payment_status === "paid") { await finalizeSession(session); counts.salesRecorded++; }
        else retainProcessing(session.metadata);
      } else if (session.status === "complete") retainProcessing(session.metadata);
    } catch { counts.errors++; }
  }
  const intents = await collectHistory((params) => stripe.paymentIntents.list(params), deadline);
  counts.historyIncomplete ||= intents.has_more;
  for (let intent of intents.data) {
    if (outOfTime()) break;
    try {
      if (intent.metadata.reservation_id || !belongsToSite(intent.metadata) || sessionIntentIds.has(intent.id)) continue;
      if (intent.status === "succeeded") { await finalizePayment(intent); counts.salesRecorded++; }
      else if (intent.status === "processing") retainProcessing(intent.metadata);
      else if (intent.status !== "canceled") {
        try { intent = await stripe.paymentIntents.cancel(intent.id, { cancellation_reason: "abandoned" }); }
        catch { intent = await stripe.paymentIntents.retrieve(intent.id); }
        if (intent.status === "canceled") counts.intentsCanceled++;
        else if (intent.status === "succeeded") { await finalizePayment(intent); counts.salesRecorded++; }
        else retainProcessing(intent.metadata);
      }
    } catch { counts.errors++; }
  }
  // A processing legacy payment has no tracked inventory owner. Leave checkout
  // gated until it is terminal, then rerun reconciliation; do not improvise an
  // unowned status change that an administrator could accidentally reopen.
  return { ...counts, processingPaintingIds: [...processingPaintingIds].sort(), scanned: { paymentIntents: intents.data.length, checkoutSessions: sessions.data.length, activePaymentLinks: links.data.length } };
}
