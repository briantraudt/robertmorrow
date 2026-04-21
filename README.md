# Robert Morrow Art

A quiet, editorial single-artist commerce site for Robert Morrow — oil paintings,
sold directly. Built with Next.js 14, Supabase, Stripe, and Vercel.

## Stack

- **Next.js 14** (App Router, Server Components, TypeScript)
- **Supabase** — Postgres for paintings/offers/orders + storage for painting images
- **Stripe** — hosted Checkout Sessions for cart purchases, Payment Links for accepted offers
- **Vercel** — hosting + automatic deploys from `main`
- **Resend** _(optional)_ — transactional email for offers, contact form, and accepted-offer payment links

The site works out of the box without any env vars — it falls back to 40 seeded
paintings and logs emails to the console. Everything progressively unlocks as you
wire up each service.

---

## Quick start (local)

```bash
npm install
cp .env.local.example .env.local   # fill in at least NEXT_PUBLIC_SITE_URL
npm run dev
```

Open http://localhost:3000. You'll see the gallery with seed data. Add to cart,
open the detail overlay, submit an offer — all of it works in "demo" mode without
Supabase or Stripe. Offers and orders just log to the terminal.

---

## Full setup (production)

You already have accounts for all four services. Follow these in order.

### 1. GitHub

Initialize and push the project.

```bash
cd "Robert Morrow Art"
git init
git add .
git commit -m "Initial commit"
gh repo create robertmorrow-art --private --source=. --push
# or create the repo on github.com and push manually
```

### 2. Supabase

1. Create a new project on [supabase.com](https://supabase.com/dashboard).
2. Once it's provisioned, open the **SQL Editor** and paste the contents of
   `supabase/schema.sql`. Run it. That creates the `paintings`,
   `painting_images`, `offers`, and `orders` tables with RLS policies.
3. In **Settings → API**, copy these three values into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` _(server-only — never expose)_
4. Seed the paintings table from `lib/seed-data.ts`:
   ```bash
   npm run seed
   ```
5. _(Optional — for real photos)_ In **Storage**, create a public bucket called
   `paintings`. Upload JPEGs named `{slug}-1.jpg`, `{slug}-2.jpg`, etc. The
   `PaintingImage` component reads the `images` column on the painting row; just
   update each row's `images` array to the public URLs.

### 3. Stripe

1. In the [Stripe dashboard](https://dashboard.stripe.com/test/apikeys), grab:
   - `STRIPE_SECRET_KEY` (starts with `sk_test_` or `sk_live_`)
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (starts with `pk_test_` or `pk_live_`)
2. Create a webhook endpoint at **Developers → Webhooks** pointing to
   `https://robertmorrow.art/api/webhook` with event `checkout.session.completed`.
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. For local webhook testing:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhook
   ```
   Use the `whsec_...` it prints as your local `STRIPE_WEBHOOK_SECRET`.

### 4. Resend (email)

Without this, every email falls back to `console.log`. The site still works — Robert
just won't get notified of offers or order confirmations.

1. Sign up at [resend.com](https://resend.com), verify `robertmorrow.art` as a sending domain.
2. Generate an API key → `RESEND_API_KEY`.
3. Set `CONTACT_EMAIL=robert@robertmorrow.art` (or wherever Robert reads mail).

The sender address used across the codebase is `offers@robertmorrow.art` and
`robert@robertmorrow.art`. Update those strings in `app/api/offers/route.ts`,
`app/api/offers/[token]/route.ts`, and `app/api/contact/route.ts` if you want
different from-addresses.

### 5. Vercel

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new).
2. Framework detection should pick up Next.js automatically.
3. Add every variable from your `.env.local` to **Settings → Environment Variables**
   (Production + Preview). Set `NEXT_PUBLIC_SITE_URL` to `https://robertmorrow.art`.
4. Deploy.
5. Copy the production URL; update Stripe's webhook endpoint to point at it.

### 6. Domain (robertmorrow.art)

The domain is already registered. In your registrar's DNS settings, add these
records pointing at Vercel:

| Type  | Name | Value                |
|-------|------|----------------------|
| A     | @    | `76.76.21.21`        |
| CNAME | www  | `cname.vercel-dns.com` |

Then in Vercel: **Settings → Domains → Add** → enter `robertmorrow.art` and
`www.robertmorrow.art`. Vercel will issue a certificate once DNS propagates
(usually under an hour).

---

## How the offer flow works

1. Buyer clicks **Make an offer** on a painting detail page.
2. `POST /api/offers` writes the offer to Supabase, generates an unguessable UUID
   `token`, and emails Robert an HTML note with three big buttons: **Accept**,
   **Counter**, **Decline** — each one links to `/admin/offers/[token]?action=...`.
3. Robert clicks one. The `/admin/offers/[token]` page loads, he confirms the action,
   and the client posts to `/api/offers/[token]`:
   - **Accept** — creates a one-off Stripe Product + Price + Payment Link at the
     offered amount, marks the painting `reserved`, emails the buyer the payment
     link. When they pay, the existing checkout webhook flips the painting to `sold`.
   - **Counter** — stores the counter amount, emails the buyer with it.
   - **Decline** — marks the offer declined, emails a polite note.

The token is the auth. It's a v4 UUID stored alongside the offer, so the URL
itself is unguessable. If you want harder access control for the admin pages, wire
`/admin/*` up to Supabase Auth with Robert's email as the only allowed user.

---

## Project map

```
app/
  page.tsx                  Home (hero + gallery grid)
  paintings/[slug]/         Painting detail page (also opens as overlay)
  checkout/                 3-step checkout (contact → shipping → payment)
  checkout/success/         Post-payment thank you
  admin/offers/[token]/     Robert's accept/counter/decline view
  about/ contact/           Static content
  api/
    checkout/               Creates Stripe Checkout Session
    webhook/                Stripe checkout.session.completed handler
    offers/                 POST = new offer (emails Robert)
    offers/[token]/         POST = accept/counter/decline an offer
    contact/                POST = contact form email
components/
  gallery.tsx               Masonry + filter tabs + sort
  detail.tsx                Slide-in painting detail panel
  make-offer.tsx            Modal: amount + contact, submits to /api/offers
  cart-provider.tsx         Cart context (localStorage-backed)
  cart-drawer.tsx           460px right-side cart drawer
  checkout-flow.tsx         3-step stepper + Stripe redirect
  painting-image.tsx        Real image with painterly SVG fallback
lib/
  paintings.ts              getPaintings / getPainting with seed fallback
  seed-data.ts              40 seeded paintings
  supabase/server.ts        Service-role client (server only)
  supabase/client.ts        Anon client (browser-safe)
  stripe.ts                 getStripe() helper
supabase/schema.sql         Tables + RLS policies
scripts/seed.ts             Seeds the paintings table
```

---

## Design tokens

Defined as CSS variables in `app/globals.css`:

```
--paper: #F7F4EE        warm off-white background
--ink:   #1C1915        deep near-black
--line:  rgba(28,25,21,0.12)
```

Fonts: **Cormorant Garamond** (display) + **Inter** (body), loaded via
`next/font/google` in `app/layout.tsx`.

---

## Maintenance notes

- **Adding a painting**: insert a row in `paintings` (Supabase Studio is easiest),
  then upload images to the `paintings` storage bucket and put the public URLs in
  the row's `images` JSONB column.
- **Marking sold manually**: update `paintings.status` to `sold` in Supabase. The
  gallery and detail page will reflect it immediately (`force-dynamic` on server
  components means no cache to bust).
- **Changing shipping**: the flat $45 is in `app/api/checkout/route.ts` and
  mentioned in `components/detail.tsx` ("Flat rate $45"). Update both.
- **Seed data drift**: `lib/seed-data.ts` is only used as a local-dev fallback.
  Once Supabase is populated, the seed module is effectively dead code — safe to
  leave in place as a safety net.
