# CreatorSkins

Next.js 14 (App Router) + TypeScript + Tailwind + Supabase + Stripe Connect Express + Resend.

Brands fund campaigns into escrow, creators publish content and get paid automatically once verified. Platform keeps a 17.5% commission (`PLATFORM_COMMISSION_BPS=1750`), creators receive 82.5%.

## This environment couldn't run Node

This scaffold was hand-written because the sandbox it was built in has no Node/npm installed and no working `claude` CLI, so the Stripe plugin and `stripe_implementation_planner` tool were unavailable. Nothing here has been `npm install`ed, type-checked, or run. Do that locally before trusting it:

```bash
npm install
npm run dev
```

## 1. Supabase

1. Create a project at supabase.com.
2. Run `supabase/migrations/0001_init.sql` then `0002_assignments_and_assets.sql` against it (SQL editor, or `supabase db push` once you have the CLI). The second migration also creates a private Storage bucket called `campaign-assets` via `insert into storage.buckets` — no separate Dashboard step needed for that part.
3. Copy the Project URL, `anon` key, and `service_role` key into `.env.local`.
4. Manually insert a row into `staff` for your own `auth.users.id` so you can call `/api/payouts/release`.
5. Decide on **Authentication → Providers → Email → Confirm email**. If it's ON (Supabase's default), sign-up won't establish a session immediately — the user is sent to `/signup/check-email` and has to click a confirmation link before they can log in and finish onboarding (`/onboarding`). If it's OFF, sign-up completes and creates the `brands`/`creators` row in one step. Either way works with the code as written; just know which one you've got.

## 2. Stripe

1. Enable **Connect** in the Dashboard, platform type = Platform, and turn on **Express** accounts.
2. Enable **Stripe Tax** and set your origin address (Dashboard → Tax → Settings) — required for `automatic_tax` on both the Checkout and Invoicing code paths to calculate anything.
3. Create a webhook endpoint pointing at `https://<your-domain>/api/stripe/webhook` (or use the Stripe CLI locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`) subscribed to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded` (delayed payment methods — Bacs/ACH/SEPA direct debit — confirm *after* `completed` fires; without this, escrow gets credited even if the direct debit later fails)
   - `invoice.paid`
   - `invoice_payment.paid` (newer event some accounts/API versions fire instead of/alongside `invoice.paid` — both are handled, deduped by `stripe_payment_intent_id`)
   - `account.updated` — **this is what tracks creator Connect onboarding/payout status**, including for the v2-created accounts this app uses (see "Connect v2 migration" below for why v1's event still matters here)
   - `transfer.created`
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Optional: a second, separate **v2 Event Destination** exists (`app/api/stripe/webhook-v2/route.ts`) for genuine v2-only events, but nothing in the core flow currently depends on it — safe to skip unless you're adding a feature that needs a v2-specific event. If you do set it up:
   ```bash
   stripe listen --thin-events v2.core.account.updated --forward-thin-to localhost:3000/api/stripe/webhook-v2
   ```
   prints its own signing secret for local dev (goes in `STRIPE_WEBHOOK_SECRET_V2`, separate from `STRIPE_WEBHOOK_SECRET`); for production, create it via `POST https://api.stripe.com/v2/event_destinations`.
6. Copy your secret/publishable keys into `.env.local`. Use **restricted keys** in production, scoped to only what this app needs (Checkout, Invoicing, Connect, Transfers).

## 3. Resend

Verify your sending domain and set `RESEND_API_KEY` / `EMAIL_FROM`.

## How money moves

- **Creator onboarding** (`POST /api/connect/onboard`) creates a Stripe **Accounts v2** recipient account (`configuration.recipient` requesting `stripe_balance.stripe_transfers` only — creators don't take card payments directly) and returns an Account Link for KYC, same as before.
- **Brand funds a campaign** two ways:
  - `POST /api/campaigns/:id/deposit` — Stripe Checkout, `automatic_tax` on, funds land on the **platform's** balance (this is the "separate charges and transfers" pattern, not a destination charge).
  - `POST /api/campaigns/:id/invoice` — Stripe Invoicing with `days_until_due: 30` for brands who want NET terms instead of paying by card immediately.
- **Webhook** (`/api/stripe/webhook`) reconciles both funding paths into `escrow_transactions` and bumps `campaigns.escrow_balance` atomically via a Postgres RPC, tracks Connect account status via `account.updated` (reads the v2 `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status` path, falling back to the deprecated v1 `charges_enabled`/`payouts_enabled` fields only if that's unavailable), and flips `payouts.status` to `paid` once the Transfer clears. `checkout.session.completed` and `checkout.session.async_payment_succeeded` share the same handler — the latter is what actually confirms delayed payment methods like Bacs Direct Debit, since `completed` fires before the payment has necessarily cleared (`payment_status` distinguishes the two). The shared `fundCampaign` helper checks whether its own `escrow_transactions` insert actually succeeded (not just whether a row already existed beforehand) before incrementing the balance — two webhook deliveries racing for the same payment is a real scenario, not hypothetical, and skipping that check let one payment double-credit escrow during testing.
- **Submission verification** (`POST /api/submissions/:id/verify`, staff-only) flips a `submissions` row from `pending` to `verified`.
- **Payout release** (`POST /api/payouts/release`, staff-only) is called once a submission is marked `verified`. It checks `campaigns.escrow_balance >= agreed_amount` first — rejects with 409 if the campaign's been over-assigned relative to what's actually left in escrow — then claims the payout row via a unique constraint on `submission_id` *before* calling Stripe, so a duplicate/concurrent release can't create two Transfers for the same submission. It splits `agreed_amount` 82.5/17.5, creates a `Transfer` to the creator's connected account, and emails the creator via Resend. (Note: the escrow check isn't fully race-proof against two *different* submissions on the same campaign being released at the exact same instant — acceptable for now, worth hardening with row locking if that becomes a real scenario.)

## Campaign assignments and overlay assets

- A brand **assigns a creator to a campaign at an agreed rate** (`POST /api/campaigns/:id/assign`, brand-only) two ways: search by name (`GET /api/creators/search?q=`, partial `display_name` match, returns up to 10) and assign directly by `creatorId`, or — if the exact email is already known — looks the creator up via a `get_creator_id_by_email` Postgres function since `auth.users` isn't reachable through the normal client. Either path creates a `campaign_creators` row, one per (campaign, creator) pair.
- A brand **uploads overlay assets** (`POST /api/campaigns/:id/assets`, multipart file upload, mp4/mov/webm/png, 200MB cap) to Supabase Storage (`campaign-assets` bucket) and records metadata in `campaign_assets`.
- Anyone authorized — the owning brand, an assigned creator, or staff — can **list assets with time-limited signed download URLs** (`GET /api/campaigns/:id/assets`). The bucket is private with no Storage policies at all; every read/write is mediated by these API routes using the service-role client after an explicit authorization check, rather than relying on Storage RLS.
- An assigned creator **submits content** (`POST /api/submissions`) by pulling the agreed rate from their `campaign_creators` assignment — this is what finally replaces the raw-SQL submission inserts used throughout earlier testing.

## Auth

Real Supabase Auth is wired up: `/signup` (email + password + role picker, creates the `brands`/`creators` row via `/api/auth/complete-profile`), `/login`, and a minimal `/dashboard` that redirects to `/onboarding` if a logged-in user somehow has neither a brand nor creator row yet (e.g. they confirmed via email link rather than completing sign-up in one flow). `middleware.ts` refreshes the Supabase session cookie on every request except the Stripe webhook route.

`app/api/dev/login/route.ts` (the curl-only password-login helper used throughout testing) is still there and still gated to non-production, but is no longer strictly necessary for testing now that real login exists — safe to delete whenever you don't need curl-based API testing anymore.

`/dashboard` shows different sections depending on the logged-in user's roles (a user can be a brand, creator, and/or staff simultaneously — checked independently, not mutually exclusive): `BrandCampaigns` (create + fund campaigns, assign creators, upload assets), `CreatorConnect` (Stripe onboarding status + button) plus `CreatorCampaigns` (assigned campaigns, download assets, submit content), and `StaffSubmissions` (verify submissions, release payouts) all render side by side if applicable. Any cross-user read not covered by an RLS policy (staff seeing all submissions, creators seeing campaign details they're assigned to, asset signed URLs) uses the service-role admin client after an explicit authorization check in code, rather than relying on RLS — this project got burned once by an RLS-scoped read silently returning nothing instead of erroring, so this is now the deliberate default for anything privileged/cross-user.

## Connect v2 migration

Creator accounts are created via Stripe's **Accounts v2 API** (`stripe.v2.core.accounts.create`), not the older `type: 'express'` pattern — that part of the migration is real and confirmed working. Account Links still work the same for hosted onboarding.

What's *not* what you'd expect: v2 resources have a separate event system called **Event Destinations** ("thin events"), and the natural assumption is that a v2 account's status changes would need that new system. In practice, for `dashboard: "express"` accounts specifically, capability status changes were only ever observed firing the **classic v1 `account.updated` event** — a real `v2.core.account.updated` thin event never fired during testing, even with a wildcard (`--thin-events '*'`) subscription active for the whole onboarding flow. So `app/api/stripe/webhook/route.ts`'s `account.updated` handler is what actually tracks Connect status: it re-fetches the account via `stripe.v2.core.accounts.retrieve(id, { include: ["configuration.recipient"] })` — note the required `include` param, without it `configuration` silently comes back `null` even for a fully onboarded account — and reads `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status`, falling back to the deprecated v1 `charges_enabled`/`payouts_enabled` fields only if that v2 lookup fails.

`app/api/stripe/webhook-v2/route.ts` (the genuine Event Destinations handler, own signing secret `STRIPE_WEBHOOK_SECRET_V2`, own Stripe CLI flags `--thin-events`/`--forward-thin-to`) still exists and works correctly — verified via `stripe.parseEventNotification()` (note: **not** `stripe.constructEvent()`, which explicitly rejects v2 payloads, and **not** nested under `.webhooks`) — but nothing in the current feature set needs it, since the only v2 thin event actually observed firing was `v2.core.account_link.returned`, not anything capability-related. Kept in place for future v2-only event types.

One more thing worth knowing if this area gets touched again: webhook-reported status can legitimately lag Stripe's real state by a few seconds — `account.updated` fires the instant a change starts, but capability verification can still be mid-flight at that exact moment. This isn't a bug, it's inherent to any webhook-based status system, and it predates this migration. If accurate status matters more than eventual consistency, consider a periodic reconciliation job re-checking `pending` accounts rather than trusting the webhook alone.

## Per-campaign detail page

`/campaigns/[id]` is a dedicated page per campaign, replacing what used to be inline expand/collapse panels on the dashboard lists. Access is role-based: the owning brand sees fund buttons (draft only), asset upload/list, and the search/email assign form (`CampaignDetailBrand.tsx`); an assigned creator sees their agreed rate, the asset list, and the submit-content form (`CampaignDetailCreator.tsx`); anyone else gets redirected back to `/dashboard`. Funding success/cancel now redirects here (`?deposit=success`/`?deposit=cancelled`) instead of the generic dashboard. `BrandCampaigns`/`CreatorCampaigns` on the dashboard are now simpler summary lists with a "View details" link into this page, rather than duplicating the same management UI inline.

## Creator dashboard status table + unique content links

`CreatorCampaigns` on `/dashboard` mirrors the brand's "Creators & content" table from the creator's side: every campaign a creator's assigned to, with their rate, content link, and status (`Awaiting your content` → `Submitted — awaiting verification` → `Verified — payout pending` → `Payout processing`/`Paid`/`Payout failed`, or `Rejected`), replacing what used to be a plain title+rate list. Data is joined server-side in `app/dashboard/page.tsx` (admin client, `campaign_creators` → `submissions` → `payouts`), same pattern as the brand table.

Alongside this, `submissions.content_url` now has a database-level unique constraint (`supabase/migrations/0004_unique_content_url.sql`) — a creator (or, deliberately, any creator) reusing the same content link across two different campaigns would mean getting paid twice for one piece of work, so it's blocked outright rather than relying on staff to catch it during verification. `POST /api/submissions` catches the `23505` violation and returns a friendly "This content link has already been submitted" 409 instead of a raw error. Applying the migration required a one-time manual cleanup of pre-existing duplicate placeholder URLs in test data first (a real constraint can't be added on top of existing violations).

## Creators & content table

The brand's `/campaigns/[id]` page has a "Creators & content" section (`CampaignSubmissionsTable.tsx`) listing every creator assigned to the campaign alongside their content submission and payment status, all in one place — no more piecing that together from separate dashboard sections. Built server-side in `app/campaigns/[id]/page.tsx` (admin client, since it joins `campaign_creators` → `submissions` → `payouts` across users, same cross-user-read pattern as the rest of this app): one row per submission, or a single "Awaiting content" row for a creator who's assigned but hasn't submitted yet. Status label covers the full lifecycle: `Awaiting content` → `Submitted — awaiting verification` → `Verified — payout pending` → `Payout processing` / `Paid` / `Payout failed`, or `Rejected`. Tested with a real assign → submit → verify → release loop; each stage's label was confirmed correct in the browser.

## Payout release self-heals stale Connect status

**Real bug found and fixed (2026-07-15):** `POST /api/payouts/release` used to hard-reject with 409 if `creators.stripe_payouts_enabled` was `false` in Supabase — but that field is only as fresh as the last `account.updated` webhook we actually received and processed, and during testing a creator (Jordan Baker) had fully completed Connect onboarding, with Stripe's own API confirming `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status: "active"`, while Supabase still showed `false`. The webhook never updated the row (delivery/processing gap, not just verification lag). Fixed by having the route fall back to a live Stripe check — the same `stripe.v2.core.accounts.retrieve(id, { include: ["configuration.recipient"] })` call the webhook itself uses — before rejecting, and opportunistically writing the corrected status back to `creators` if the live check shows active. Verified working: the same account that was previously blocked released successfully afterward without any manual Supabase edit. This doesn't replace the still-open periodic-reconciliation-job idea (that would catch *all* stale accounts proactively); this is a narrower, immediately-useful safety net specifically at the moment a payout is actually attempted.

## Campaign top-up

A brand can add more funds to a campaign that's already `funded`/`active` — not just fund it once from `draft`. Both `POST /api/campaigns/:id/deposit` and `POST /api/campaigns/:id/invoice` accept an optional `topUpAmount` (integer, minor units) in the request body: with `status = 'draft'` the original `budget_amount` is still charged as before; with `status` in `('funded', 'active')` and a `topUpAmount` provided, that amount is charged instead (rejected with 409 otherwise). The UI section for this lives in `CampaignDetailBrand.tsx` ("Top up escrow"), shown only once a campaign is past draft.

`budget_amount` is deliberately left unchanged by a top-up — it stays the original planned figure, while `escrow_balance` (via the same `fundCampaign`/`increment_escrow_balance` path used for initial funding, so the double-credit and idempotency protections apply here too) reflects the running total actually available. Tested end-to-end: an already-funded £30 campaign (`escrow_balance: 3000`) topped up by £505 via Checkout/card correctly landed at `escrow_balance: 53500` with a second `escrow_transactions` row — confirming both the arithmetic and that a non-round top-up amount flows through correctly.

## Periodic Connect reconciliation job

`GET /api/cron/reconcile-connect-accounts` is the proactive counterpart to the self-heal check in `/api/payouts/release` — that one only catches a stale Connect status at the moment a payout is attempted; this one walks every creator who isn't yet fully `stripe_onboarding_complete`/`stripe_payouts_enabled`, re-checks each against Stripe directly (via the same `resolveConnectStatus()` helper in `lib/connectAccountStatus.ts`, now shared across the webhook handler, payout release, and this job), and updates Supabase if Stripe's real status has moved on without a webhook ever arriving to report it. Only rechecks accounts that aren't already fully green, to avoid burning a Stripe API call on every creator on every run.

Protected by a bearer token, not user auth — it's meant to be called by a scheduler, not a logged-in user. Set `CRON_SECRET` in your environment (a random value; generate one with `openssl rand -hex 32`) and excluded from `middleware.ts`'s session-refresh matcher alongside the Stripe webhook route.

**On Vercel:** `vercel.json` already defines an hourly cron (`0 * * * *`) hitting this route. Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on cron-triggered requests when that env var is set on the project — no extra wiring needed. Note the Hobby plan limits cron jobs to once/day; Pro allows hourly and finer.

**On any other host:** point any scheduler (system `cron`, a GitHub Actions scheduled workflow, Supabase's own scheduled Edge Functions, etc.) at:
```bash
curl https://<your-domain>/api/cron/reconcile-connect-accounts \
  -H "Authorization: Bearer $CRON_SECRET"
```

Tested manually via curl against local dev: ran cleanly end-to-end (auth check, Supabase query, response shape all correct) with `{"checked": 0, "updated": 0, "failures": []}` — expected, since the only creator that was ever stale (Jordan Baker, see the payout-release bug above) had already been corrected by the time this ran. Not yet exercised against a genuinely stale account, since none currently exists in test data; the logic path is identical to the already-proven payout-release self-heal, just applied proactively across all creators instead of one at a time.

## Visual design system

The app UI now matches creatorskins.com's real design language rather than generic Tailwind neutrals: dark background (`#0E0A1A`), surface panels (`#1A1228`/`#221832`), violet accent (`#A855F7`, hover `#C084FC`), green for positive states (`#4ADE80`), **Space Grotesk** for headings/labels/buttons and **Inter** for body text (loaded via `next/font/google` in `app/layout.tsx`), sharp corners throughout (`tailwind.config.ts` sets the default `borderRadius` to `0px` to match the live site's edge-to-edge aesthetic rather than hunting down every `rounded` class individually). Tokens live in `tailwind.config.ts` (`ink`/`surface`/`surface2`/`accent`/`accent-light`/`positive`) — extracted directly from the live site's computed styles, not guessed.

Applied across the landing page, all auth pages (login/signup/onboarding/check-email), the dashboard and all its role-specific sections, and the campaign detail page and its brand/creator panels.

**Scope note:** the live marketing site's copy describes a different core mechanic than what's built — a self-serve "skin library" creators browse/download from, with payment auto-verified via TikTok/YouTube/Instagram APIs (flat-rate or per-view-royalty). What's actually built is the staff-assisted version: staff/brands assign creators, creators submit a URL, staff manually verify and release payout. This is intentional for now — the auto-verification piece is future Phase 2 work, not yet built. Landing page copy was adjusted where it overclaimed the brand's direct role (previously "payout happens automatically once you approve," which implied the brand releases payment directly — corrected to attribute verification to the team, since only staff can release a payout in the current build).

## Basic content management for the landing page

The landing page's copy (hero eyebrow/strapline/subheading/CTAs, plus the "For Brands"/"For Creators" headings, benefit bullets, step lists, and buttons — 25 fields total) is no longer hardcoded. It lives in a `site_content` table (`key`/`value`/`label`, seeded by `supabase/migrations/0005_site_content.sql`) and is editable at `/admin/content`, a staff-gated form (same `staff` table check as every other privileged route). Saving calls `PUT /api/admin/content`, which re-checks staff membership server-side and updates each row via the admin client — no direct client-side writes, consistent with this app's standing pattern for privileged mutations.

The public landing page (`app/page.tsx`) is a server component that fetches the current values from Supabase on every request via the regular (non-admin) client — `site_content` has a public `select` RLS policy since this is landing-page copy that's already publicly visible by definition, so no auth is needed to read it. A hardcoded `DEFAULTS` map in the same file covers any key that's ever missing from the table, so a failed fetch or an unseeded row degrades to the original copy rather than breaking the page. No caching layer — edits in `/admin/content` are visible on the next page load, which matters more than performance for a low-traffic pilot site.

Deliberately minimal: plain text fields only, no rich text, no image uploads, no drafts/versioning. Scoped to the landing page only — the dashboard and campaign pages are still hardcoded, since that's application UI rather than marketing copy. If this ever needs to expand to more pages or richer content types, worth reassessing whether a proper headless CMS (e.g. Sanity) is a better fit than continuing to hand-roll it — that trade-off was discussed but deliberately deferred in favor of this lighter option, which reuses existing infrastructure instead of adding a new vendor.

## Creator channels (self-reported, unverified)

A creator can add and remove the channels they publish on — platform (YouTube/TikTok/Instagram/Other) plus a handle or URL — via a new "Your channels" section on `/dashboard`, positioned right under the "Signed in as"/"Creator account" summary. Backed by `creator_channels` (`supabase/migrations/0007_creator_channels.sql`), managed via `POST`/`DELETE /api/creator-channels`, standard staff-free creator-owns-their-own-row pattern (session check + admin client, RLS policy present for defense in depth).

**Deliberately not verified.** This is self-reported data with no ownership proof — a creator could type in a channel that isn't theirs. That's an accepted trade-off, not an oversight: payout release already requires staff to verify the actual submitted content URL contains the real brand content before releasing anything, so a false channel claim here doesn't create a money-safety issue, only inaccurate discovery data. The `verified` column exists on the table (defaults `false`) for future use if this ever needs to change — e.g. if brands want proof, a lightweight identity-only OAuth per platform would prove ownership outright, and is a meaningfully smaller ask than the insights-scope OAuth Phase 2's view-tracking would need (see the Phase 2 memory note for that distinction). No verification flow is built.

## Per-creator payout cap, rejection, and brand flagging

A real gap surfaced during testing: nothing previously stopped a creator submitting multiple pieces of content against one campaign assignment and being paid the full `agreed_amount` for each one — the unique constraint on `payouts.submission_id` only stops double-paying the *same* submission, not unlimited different ones. Fixed with `campaigns.max_submissions_per_creator` (default 1, set on the campaign creation form), enforced in `POST /api/payouts/release` by counting existing payouts for that creator+campaign before allowing another.

Staff previously had no way to actually **reject** a submission — the status existed and displayed correctly if set, but nothing could set it. `POST /api/submissions/:id/reject` (staff-only, requires a reason shown to the creator) fills that gap.

Brands also get a **48-hour review window** after staff verifies a submission (`lib/payoutHold.ts`, `PAYOUT_HOLD_HOURS`) during which they can flag something off-brand (`POST /api/submissions/:id/flag`, requires a reason) — this doesn't give the brand veto power over payment (that stays a staff decision, preserving the pro-creator trust model this was built around), it just pauses release and surfaces the concern to staff, who resolve it by either dismissing the flag (`POST /api/submissions/:id/resolve-flag`) or rejecting the submission outright (which also closes the flag as part of that decision). With no flag raised at all, release simply waits out the full window before proceeding. The brand's "Creators & content" view is now grouped into **Approved & paid / Awaiting approval / Rejected** sections rather than one flat list, addressing a real need for a brand's marketing manager to see approved/paid content at a glance.

Also added: real **YouTube view counts** (`GET /api/youtube-views`, needs a `YOUTUBE_API_KEY` env var — see [Google Cloud Console](https://console.cloud.google.com), enable "YouTube Data API v3", create an API key) shown to both brand and staff for any YouTube submission, via the public Data API — no OAuth needed. TikTok/Instagram don't have an equivalent clean path yet (see the Phase 2 memory notes).

Tested end-to-end: cap correctly blocks a second release once reached; reject correctly shows the reason to the creator; flag → dismiss → release correctly worked once escrow/Stripe balance issues (unrelated, pre-existing test-mode mechanics) were resolved.

## What's deliberately not built yet

Nothing structural remaining. Bacs Direct Debit is now enabled and confirmed working end-to-end — note if it's ever re-enabled/reconfigured that Stripe accounts can have multiple **Payment Method Configurations**, and only the one marked `is_default: true` is what Checkout actually uses; enabling a payment method in a non-default configuration silently does nothing for this app's Checkout sessions.
