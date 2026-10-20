import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { auditPayments, recoverInventory, reconcileLegacyPayments } from "@/lib/inventory-maintenance";
import { installInventoryWebhook, verifyInventoryWebhook, retireLegacyWebhooks } from "@/lib/inventory-webhooks";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = new URL(req.url).searchParams.get("audit") === "1" ? await auditPayments() : await recoverInventory();
    const failed = "pending" in result && (result.pending.errors > 0 || result.expired.errors > 0);
    return NextResponse.json(result, { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[inventory-maintenance]", err instanceof Error ? err.message : "Maintenance failed");
    return NextResponse.json({ error: "Inventory maintenance could not finish." }, { status: 503 });
  }
}
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    if (body.action === "install_webhook") {
      // Stripe issues its secret directly to this server, which persists it in
      // encrypted Vault storage. Operator responses contain metadata only.
      return NextResponse.json(await installInventoryWebhook(), { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "verify_webhook") {
      return NextResponse.json(await verifyInventoryWebhook(), { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "retire_legacy_webhooks" && typeof body.replacementId === "string") {
      return NextResponse.json(await retireLegacyWebhooks(body.replacementId), { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action !== "reconcile_legacy") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    const result = await reconcileLegacyPayments();
    return NextResponse.json(result, { status: result.errors > 0 || result.historyIncomplete ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[legacy-inventory]", err instanceof Error ? err.message : "Reconciliation failed");
    return NextResponse.json({ error: "Legacy payment reconciliation could not finish." }, { status: 503 });
  }
}
