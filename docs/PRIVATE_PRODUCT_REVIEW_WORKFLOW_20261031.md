# Apex Phase 2 — Private supplier product review workflow

Date: 2026-10-31. Branch and review-only SQL. Target: the **existing** Supabase project `fhqpkpztercadcxspdkg`. Do not create a second Supabase project or hosted database branch.

## Supplier experience

Each private draft still shows its eight data-setup checks (name, SKU, description, category, private image, price, internal active status, on-hand stock), now collapsed behind **8/8 complete · View checks** once finished. With owner or manager access, a complete private draft can be submitted to internal review. Status displays: **Not submitted**, **Pending review**, **Changes requested**, or **Approved internally**. Review feedback is visible on the product card; suppliers can correct the product and resubmit after changes were requested.

The supplier action checks a confirmed signed-in user, owner/manager role, same private store and the preexisting draft-write flag. The database function independently verifies the membership and all eight current values before inserting or resubmitting. Repeat pending submissions and resubmission of already-approved drafts are rejected.

## Admin experience

The existing trusted platform-admin dashboard links to `/admin/product-reviews`. Only users with `app_metadata.apex_role = platform_admin` (not user metadata or an email allowlist) can load the queue or submit decisions. Admins see the submitted metadata snapshot and can record either **Request changes** (requires a note) or **Approve internally** (optional note). Decisions write an append-only audit entry and use the exact `submission_id` to reject stale forms. Internal approval requires that the product data and stock still match the submitted snapshot.

This is **content review**, not regulatory clearance or marketplace publication. Even `approved_internal` makes no changes to product, category or store publication, image visibility, checkout, payments, or fulfillment. A distinct approved publication workflow would be needed later. Editing products after an internal approval does not automatically invalidate the recorded review status; this should be considered before a future publication gate and should never be used as sufficient authorization to publish.

## Database change: review only

Source: `database/sql/apex_private_product_review_REVIEW_ONLY.sql` (not yet applied to the existing Supabase database).

Adds `private_product_review_states` and an append-only `private_product_review_history`. Both are RLS-protected, with SELECT allowed to supplier owner/manager of the relevant storefront or trusted platform admin. The Data API has **no direct INSERT/UPDATE/DELETE grants** on either table. Two narrowly scoped SECURITY DEFINER RPCs validate authorizations, product state, and transition rules, and append audit history. Functions set `search_path=pg_catalog`; `EXECUTE` is granted to authenticated users only but independently enforces supplier or platform-admin JWT checks. This security-definer decision requires careful code review before deployment and should be monitored with Supabase security advisors.

The migration does not rename or replay old hosted migrations. Avoid blind `supabase db push` or `db reset` due to known hosted migration history drift. Apply exactly this reviewed migration only after GitHub CI and review; record the resulting hosted migration version in a follow-up repository migration capture.

## QA

CI runs regular Node lint/typecheck/tests/build and the existing isolated PostgreSQL 17 integration suite. New regression tests check: tenant isolation, supplier role restriction, no forged admin decision for absent app_metadata, resubmission with a new submission ID, required change notes, append-only history, and no public catalog mutation. Existing CI fixture data is synthetic; no new remote databases are provisioned.

Manual QA after migration and release: sign in as supplier owner, submit an 8/8 draft, refresh and see pending; sign in as platform admin, request changes with a note; confirm feedback and resubmit; approve internally, confirm status and ensure the public storefront still shows no new listings. Check a staff account cannot submit, another supplier cannot access this draft, and an outdated admin form cannot overwrite the latest submission.
