# Site audit — 20 October 2026

Scope: the existing production storefront, painting pages, cart/checkout, offers, Studio administration, Supabase inventory, Stripe integration, deployment configuration, accessibility basics, metadata, and runtime dependency security. This is an implementation and functional audit, not a certification or a simulated penetration test.

## Critical finding: duplicate-sale exposure

The previous checkout created payable Stripe objects without a transactional stock reservation. A later webhook updated orders and painting status separately, and reusable offer Payment Links could create multiple checkouts. Client carts could retain stale inventory. Consequently, a display-only sold flag was insufficient to prevent two payments for the same original.

The update adds server-owned reservations and immutable prices, one hold and one sale identity per painting, consistent row locking for overlapping carts, idempotent Stripe creation, atomic paid-order finalization, signed webhook verification with retryable fulfillment failures, single-use offer Checkout Sessions, and conservative cancellation/recovery. Missing database data never reintroduces seeded saleable paintings.

The home gallery excludes sold work; direct pages preserve history while disabling purchase controls. Open carts recheck current inventory on focus and periodically. Paid confirmations remove only the verified purchased items.

## Other findings addressed

| Area | Finding and change |
| --- | --- |
| Painting photos | Eleven direct detail pages showed generated placeholders although gallery images existed. Detail and list queries now read the same image records and image-only fallbacks. |
| Checkout recovery | Retries could create new payment attempts; editing or refreshing could lose state. A saved checkout reference now resumes the same attempt and freezes payment details until cancellation is confirmed. |
| Confirmation | Pending/processing responses could look successful or clear the cart prematurely. Success requires a server-verified paid state, with separate pending, processing, expired, missing, and error states. |
| Checkout display | Prices now come from the reserved server snapshot. Payment-step errors are visible; narrow-screen spacing and input grids have containment rules. |
| Modal interaction | Detail, cart, and offer dialogs receive focus, trap Tab, handle only the topmost Escape, restore focus, and lock background scrolling. Closed cart controls are inert. Direct-page cart layering and browser Back behavior were corrected. |
| Studio sessions | Nonexpiring sessions were replaced with signed, server-checked expiry. Admin return URLs are confined to Studio. Offer-token pages require login. |
| Studio inventory | Painting and image writes are transactional. Stale status edits, changes to active holds, deletion of reserved/sold work, and reopening a recorded sale are blocked. |
| Uploads | Invalid/oversized image content fails closed; decoded image limits and JPEG normalization are enforced. |
| Forms and offers | Input and origin validation, bounded fields, rate limits, checked database results, and truthful email outcomes were added or tightened. Saved offers and accepted payment links remain visible when notification fails. |
| Counter offers | Studio explicitly labels accepting the original amount; agreeing to a counter creates a fresh buyer offer, preventing ambiguous pricing. |
| Metadata | Added a homepage primary heading, accurate image alt text, medium-aware painting metadata, current availability, and dynamic sitemap/catalog pages. |
| Dependencies | Updated Next.js, React, Sharp, and affected runtime transitive dependencies. The production dependency audit reported no known vulnerabilities in the tested lockfile. |

## Verification completed before release

- Production baseline: home, About, Contact, and all 44 public painting detail routes returned HTTP 200; all 44 gallery image endpoints were reachable.
- Real Postgres inventory suite: 79 assertions/error expectations, with rollback-only fixtures.
- Real concurrent Postgres suite: 9 independent-connection race scenarios, including simultaneous buyers, overlapping carts, offer-versus-cart, repeated finalization, legacy payment conflicts, and admin races.
- Admin validation/session suite: 9 passing cases.
- Checkout input suite: 4 passing cases.
- Payment orchestration suite: 14 passing cases using actual application modules with isolated Stripe/database/network ports.
- Checkout UI suite: 11 passing cases rendering actual checkout/success components with isolated network, router, and Stripe ports.
- Legacy-provider maintenance suite: 6 passing cases for pagination, mutation ordering, races, processing states, errors, and incomplete-history reporting.
- TypeScript checks and optimized production build passed.

Tests deliberately exercise duplicate delivery, request/response loss, payment success racing cancellation, processing payments, provider failures, database failures, invalid signatures, stale UI state, immutable pricing, and the deployment checkout gate. Mocked provider tests complement the actual database concurrency tests; they are not described as real card charges.

## Verification boundaries and ongoing operations

No real buyer was charged, no live test contact/offer email was sent, and no real painting was bought as an audit test. Email API acceptance and actual inbox delivery are different outcomes. Admin mutation tests used fixtures and isolated dependencies; existing inventory was preserved by the schema migration. Browser automation supports desktop interaction here; responsive source containment was checked, while real mobile-device validation remains a separate device test.

The production dependency scan excludes developer-only packages. Any remaining developer-tool advisory must be assessed separately from deployed runtime packages. Check dependency advisories again during routine maintenance because the registry changes over time.

The recovery cron and webhook should remain enabled. Inspect failed webhook deliveries and inventory-recovery errors promptly; uncertainty intentionally keeps an original reserved. Card processors, email delivery, and hosting can fail independently, so no finite audit guarantees every future transaction.

Deployment validation, legacy-provider reconciliation, and final live checks are recorded with the release commit and operational handoff.
