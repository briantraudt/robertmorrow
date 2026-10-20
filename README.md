# Robert Morrow Art

An original-painting storefront, private Studio, and payment workflow for [robertmorrow.art](https://www.robertmorrow.art/). Built with Next.js 15, React 19, Supabase, Stripe, and Vercel. Resend delivers contact and offer emails.

## Inventory and payment behavior

Each painting is a single inventory item. Adding it to a cart does not reserve it. Preparing payment atomically reserves the complete cart in Postgres before Stripe returns a usable payment form. A cart hold lasts 30 minutes; an accepted offer uses a single-use Stripe Checkout Session and a 24-hour hold.

`supabase/inventory.sql` installs private reservation, hold, and sale tables. A unique hold and a unique sale per painting, row locks, immutable price snapshots, and transactional database functions prevent two customers from buying the same original. Overlapping carts either reserve all their paintings or fail without a partial hold.

Successful payment is verified server-side against Stripe, then one transaction records the order, marks its paintings sold, records their unique sale ownership, and completes the reservation. Duplicate callbacks are safe. Sold work disappears from the home gallery and other customers' carts. Its direct page and Studio record remain available as historical records with purchase controls disabled.

Expiry is a reconciliation deadline, not permission to release stock. The server first cancels the PaymentIntent or expires the Checkout Session at Stripe. Processing payments and uncertain provider responses keep their paintings reserved. A scheduled recovery job retries incomplete creation and checks expired reservations every 10 minutes. Webhooks and the verified success-page status check also complete sales.

Checkout retries reuse a persisted reservation UUID and Stripe idempotency key. Buyer details and prices are frozen while a payment is active. Editing them first requires confirmed cancellation. The cart clears only the paintings that the server confirms as paid.

## Local development

```bash
npm ci
cp .env.local.example .env.local
npm run dev
```

Use an isolated Supabase project and Stripe test-mode credentials for development. Apply `supabase/schema.sql`, then `supabase/inventory.sql`. The live catalog requires a working database; it never falls back to seeded saleable inventory after a database error. Seed image URLs remain an image-only fallback for existing database records. The seed scripts are manual setup utilities and must not be run against an established production catalog.

### Environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public catalog client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database access |
| `STRIPE_SECRET_KEY` | Server-only Stripe key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Matching Stripe public key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for this site's webhook endpoint |
| `NEXT_PUBLIC_SITE_URL` | Canonical absolute origin, production `https://www.robertmorrow.art` |
| `ADMIN_PASSWORD` | Studio password |
| `ADMIN_SESSION_SECRET` | Separate random signing secret for expiring Studio sessions |
| `RESEND_API_KEY` | Email delivery; contact submissions fail clearly if unavailable |
| `CONTACT_EMAIL` | Artist's notification destination |
| `CRON_SECRET` | Random bearer secret for scheduled recovery and operator diagnostics |
| `INVENTORY_CHECKOUT_ENABLED` | Must equal `true` to create checkout or accept an offer; missing/false pauses payment preparation |

Never place server-only keys in `NEXT_PUBLIC_*` variables or commit environment files. Preview deployments must keep `INVENTORY_CHECKOUT_ENABLED=false` when they share production credentials. A separate test project/account is required for interactive test purchases.

## Stripe and recovery

The webhook URL is `https://www.robertmorrow.art/api/webhook`. Subscribe to:

- `payment_intent.succeeded`
- `payment_intent.canceled`
- `checkout.session.completed`
- `checkout.session.expired`
- `checkout.session.async_payment_succeeded`

The handler verifies the raw-body signature and provider payment status. Database fulfillment errors return HTTP 500 for Stripe retries. Neither a failed card attempt nor elapsed time alone releases a painting.

`vercel.json` schedules `GET /api/cron/inventory` every 10 minutes. Vercel supplies `Authorization: Bearer <CRON_SECRET>`. The same authenticated endpoint supports `GET ?audit=1` for redacted provider/configuration counts and `POST {"action":"reconcile_legacy"}` for retiring this site's older unpaid attempts and reusable offer links. Reconciliation records verified historical successes; it never charges a card or refunds a payment. Follow any incomplete-history, processing, or error counts before reopening checkout.

Cart checkout collects a US delivery address. Accepted-offer Checkout Sessions retain the existing US/Canada address support. The painting price is charged; the site describes free local delivery and shipping available on request. Any shipping quote is arranged separately. Stripe receipt delivery depends on the Stripe account's receipt settings; the success page only promises the payment state verified by the application.

## Studio and forms

Studio requires an expiring signed cookie, including offer-token pages. A token URL alone is insufficient. Password/signing-key changes invalidate sessions. Sign in again after upgrades that change cookie format.

Painting creation, metadata/image updates, and removal use one transactional RPC with an expected-status check. Active holds and recorded sales prevent conflicting admin edits or reopening sold originals. Removal uses the existing soft-delete marker so orders retain their history. Image uploads are bounded, decoded with Sharp, normalized to JPEG, and restricted to the configured artwork bucket.

Incoming offers are saved before notification. Notification failures remain visible in Studio; accepted offers retain their secure payment URL there. Countered records explicitly distinguish accepting the buyer's original offer from the proposed counter amount. A buyer agreeing to a counter submits a fresh offer at that amount. Contact submissions only report success after the email provider accepts the request.

## Verification

```bash
npm run typecheck
npm run build
npm test
npm audit --omit=dev
```

The TypeScript suites use isolated dependencies; they make no real purchases or email sends. To see individual cases with the current Node/tsx runner, run each test file directly:

```bash
node --import tsx tests/admin.test.ts
node --import tsx tests/checkout-validation.test.ts
node --import tsx tests/payment-orchestration.test.ts
node --import tsx tests/checkout-ui.test.ts
node --import tsx tests/inventory-maintenance.test.ts
```

The real Postgres suites cover transaction and concurrency guarantees. Run them only against a disposable test database. `tests/inventory.sql` requires the base schema and inventory migration and rolls its fixtures back. `tests/inventory_concurrency.py` creates and drops its own temporary database using a privileged test connection; see its environment configuration at the top of the file.

## Deployment and incident handling

The existing GitHub `main` branch deploys to the existing Vercel project. Apply reviewed additive SQL before deploying code that calls it. For the first inventory rollout, deploy with checkout disabled, reconcile older Stripe attempts and links, confirm complete history and no unresolved payments, then enable production checkout and redeploy the same reviewed source. Keep previews disabled.

If recovery reports errors, inspect the relevant reservation and Stripe payment together. Do not manually release a painting while a payment can still succeed. Do not delete an order, inventory sale, or reservation to resolve a display problem. Use the release gate to pause new payment preparation while repairing an incident. A rollback to pre-reservation checkout code would bypass the inventory guarantees; preserve the inventory backend when reverting unrelated UI changes.

See [the audit record](docs/AUDIT.md) for the findings, fixes, and verification boundaries of the October 2026 update.
