# Apex Phase 2 — Internal Review History & Private Product QA
Date: 2026-10-31. Draft feature pass against existing repository and existing Supabase project `fhqpkpztercadcxspdkg`. **No new database or migration. No public product publishing.**

## Admin review history

The authenticated platform-admin `/admin/product-reviews` page now loads the existing `private_product_review_history` ledger using the signed-in user's normal, RLS-enforced Supabase client. It reads only the product IDs that are visible in the current admin review queue, limits the aggregate read to 500 latest records, and shows no more than 20 most recent events per product. Events are grouped with both `store_id` and `product_id` (never name or SKU) so separate suppliers cannot be conflated.

Each product card has an accessible, **collapsed Review history** timeline that displays event type, `America/Chicago` timestamp, an action-source label (supplier, platform admin, product editor/system), any admin or automatic invalidation note, and optional original snapshot metadata (SKU, purchase price, quantity, whether an image was saved). The actor's raw UUID is intentionally not displayed, and older private images are not exposed. History errors display an explicit unavailable message rather than an empty or successful audit message. The view warns if it loaded the global 500-record cap or reached the 20-event-per-product cap. This is an operational view, not a regulatory audit certification.

The history table already exists and is protected by RLS. There are **no new roles, table grants, policies, RPCs, database writes, publication flags, or image URLs** in this pass. The audit ledger remains server-controlled.

## Quality gates

Node regression tests cover all five supported event labels, Central-time timestamps including CST/CDT, grouping across tenants, bounded rendering, actor-role labels, history loading failures, and absence of privileged service-role calls. Existing quality checks cover SKU, image/stock permissions and private product submission/invalidation workflow.

Additional isolated PostgreSQL CI tests run after the existing review integrity suite and validate:
- table history rows retain non-null event snapshots and timestamps;
- anonymous history read privilege denied;
- an unrelated supplier and an unaffiliated authenticated user cannot read another supplier's audit history;
- the proper supplier manager can read their own history;
- a verified platform admin can read the history;
- INSERT, UPDATE and DELETE on review-history table remain denied to the authenticated role;
- the synthetic private product and storefront remain unpublished.

All database tests run ONLY in existing CI's local disposable PostgreSQL 17 service. No hosted database or temporary hosted Supabase branch is created. Do not execute CI SQL against production.

## Manual test following approved PR merge

1. Sign in to the live Apex admin product review queue and expand the approved product's **Review history**. Verify five events in Central time: original submission/approval, edited-product invalidation, resubmission and new approval.
2. Expand an event's saved details and verify historical SKU/stock remain distinct from the current product card when relevant.
3. Refresh and verify the timeline persists. No audit record should be editable.
4. Verify a supplier account with no platform-admin role cannot reach the admin history page. Cross-tenant product audit access remains governed by the existing RLS policies.
5. Confirm public catalog still contains zero published products/stores. Publication, checkout, payments and fulfillment remain separate controls.

Known design limit: This is a bounded latest-event view, not an exported or fully paginated historical report. A future dedicated full history page can introduce cursor pagination without broadening access or enabling public commerce.
