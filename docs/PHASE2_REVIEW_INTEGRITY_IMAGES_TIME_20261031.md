# Apex Phase 2 — Internal review integrity, admin images and Central time

Date: 2026-10-31. Reviewable work against existing `zanibethel/apex` and existing Supabase project `fhqpkpztercadcxspdkg`. **No second database. No public catalog publication.**

## Problems resolved

- Admin review cards previously used server-local `toLocaleString("en-US")`, which displayed UTC times on Vercel. New `formatReviewTime` explicitly formats `America/Chicago`, including CDT/CST transitions.
- Completed review cards displayed generic resubmission instructions. They now differentiate pending review, approved internally, and changes requested, with separate counters, actual decision timestamps and useful guidance.
- Admin review cards only said an image was saved. They now attempt a short-lived (90 seconds) private signed URL for the image stored in the **submitted review snapshot**, and render an image preview without making the Storage bucket public.
- Previously, a supplier could update product data or stock after internal approval and the database state would still read `approved_internal`. A guarded trigger now changes **pending or approved** reviews to `changes_requested` after meaningful product or inventory mutations and writes a `review_invalidated` history event. Supplier owners/managers can resubmit when complete. Empty/no-op updates do not invalidate. The original approval remains in immutable event history.

## Proposed migration — review only

`database/sql/apex_review_integrity_admin_images_REVIEW_ONLY.sql`

Preflight requires existing review tables, RLS, Storage and known history event check. Introduces `review_invalidated` event type; `actor_id` on history is nullable **only to accurately represent automated/system edits without an authenticated human actor** (application user edits still use `auth.uid()`). Installs narrowly scoped `SECURITY DEFINER` internal trigger functions with `search_path=pg_catalog` and no EXECUTE grant to PUBLIC/anon/authenticated. Product trigger covers name, SKU, description, category, price, compare-at, image, active state and currency. Inventory trigger covers insert, delete and actual stock/reservation changes. No trigger writes `is_published`, `stores.is_public`, checkout or payments.

Adds a single Storage `SELECT` policy for verified platform admins using trusted `auth.jwt().app_metadata.apex_role`. The path must equal the private image in a submission snapshot for an unpublished product in a non-public store. Existing supplier SELECT/INSERT policies remain unchanged. The private bucket remains `public=false`, without new UPDATE/DELETE permissions.

This migration is **not applied to hosted Supabase** in this PR and should be reviewed separately before release. It has no reset/seed data operations. Older checked-in SQL historical migration timestamps diverge from hosted payout history: never blindly run `supabase db push` / `db reset`.

## Verification and acceptance

CI exercises the existing synthetic supplier/administrator review flow with disposable PostgreSQL 17, followed by the review-integrity migration in an isolated test script. Checks:
- Unauthorized signed-in user cannot view any new admin-only private Storage images; verified JWT admin sees exactly the submitted image, not unrelated objects.
- No-op product update leaves approval intact.
- Changing an approved product's description records an audit event and makes it `changes_requested`.
- Corrected product can be resubmitted, reviewed internally again, and a later inventory change revokes approval.
- No-op stock update leaves status unchanged; editing during pending review also invalidates submission.
- Existing product/store publication flags remain protected.

Node tests check image signed URL TTL, Central time formatting, UI statuses and SQL security gates. Following an approved merge + separately applied migration: sign in as admin, inspect the 90-second submitted image preview and Chicago timestamps; edit one private product and verify automatic invalidation, admin history and resubmission; verify a read-only/staff account has no admin image access.

**Product content approval remains separate from eligibility review and storefront publishing. No public product browse/sales/checkout/payment activation is included.**
