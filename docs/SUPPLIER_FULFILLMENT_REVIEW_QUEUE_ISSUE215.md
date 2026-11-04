# Apex Issue #215 — Phase 2: supplier-facing fulfillment review queue

**Review-only status:** Stacked on PR #235 → #234 → #233 → #232 → #231 → #230 → #229 → #228 → #227. No merge, production migration, payment, shipping, label purchase, carrier lookup, restricted destination decrypt, order creation or tracking **write** by a supplier.

## Scope and UI

At `/supplier/fulfillment`, the supplier sees a dynamic, noindex, server-rendered, membership-checked review queue. The page authenticates through the existing `getSupplierWorkspace()` path (confirmed user and current supplier membership), asks only for the store IDs already approved by the workspace and calls the narrow RPC `get_supplier_review_fulfillment_queue` with 10 records per page. A missing RPC, rejected access or unexpected response shows `unavailable`; no fake live records are generated.

The queue separates **purchased units** (the immutable original order), **planned units** (allocated to one or more review-only shipment plans) and **unplanned units** (purchased minus planned). It includes original purchase references and Central Time, per-original-line SKU/title/variant and planned quantity, per-plan stable IDs/revisions and **tracking drafts** with carrier and observation timestamp. An order with incomplete original lines/accounting/opaque delivery source is masked, not displayed as if fulfillment-ready. No 'shipped' or 'delivered' claims are derived from planned quantity or tracking strings.

## Private SQL boundary

`database/sql/apex_supplier_review_fulfillment_queue_REVIEW_ONLY.sql` is intentionally placed outside `supabase/migrations`. Its installation and execution require `current_database() = 'apex_test'`, the previously installed Phase 1 synthetic shipment tables and **global release gate off**. It is *not production-deployable* and does not make the queue functional against the live Supabase database.

The read-only `SECURITY DEFINER` RPC has `pg_catalog` search path and checks the caller's `auth.uid()`, non-anonymous JWT and live `stores → supplier_memberships` relationship. Only `authenticated` may execute, with `limit` bounded to 1–20 and `offset` 0–1000. The underlying tables stay in unexposed `apex_internal`, forced RLS and no direct authenticated/anonymous/service-role grants.

Before showing any purchased-line totals, the function verifies the immutable held header, matching original accounting commitment, correct purchased line count and sum, sealed delivery *existence only*, matching original success audit, all shipment plans remaining `review_only`/unauthorized, and no malformed cross-store allocation or over-allocation. A failed check produces `incomplete_held_record` with **no purchased lines, shipment plans, or unit counts**.

The function returns only order ID/reference/original purchase time, line name/SKU/variant and unit quantities, shipment plan ID/external reference/revision/status/planned unit count, and syntactically validated draft carrier/tracking ID/revision/observation time. It never selects or returns an address, recipient, email, phone, ciphertext, nonce, key reference, source-signature/hash, payment/provider key, delivery access token or payout information. Its output always contains `shipping_enabled=false`, `label_purchase_enabled=false`, `tracking_entry_enabled=false` and `delivery_decryption_enabled=false`. Every order/plan also returns false authorization flags.

`src/lib/supplier/review-fulfillment-queue.mjs` validates every field against an exact allowlist; requires the requested store identity, immutable-descending purchase order, consistent pagination, strictly ordered lines, exact per-line planned/unplanned arithmetic, totals reconciling to shipment plan sums, strictly revisioned tracking-draft history, unique shipment IDs/references and tracking references, and all shipping/decrypt/write flags disabled. Malformed data fails the *whole* page closed, not just one row. No secret, payload, ciphertext or PII can be leaked via extra JSON keys.

## Verification

- `tests/payout-rls/supplier-review-fulfillment-queue.sql`: after the prior independent two-session race has committed a synthetic plan, verifies the authentic immutable synthetic original has 3 purchased units, 2 initially planned, 1 unplanned. Checks that a later independently seeded **review-only** plan and tracking draft leave 3 planned and 0 unplanned, with no actual shipping authority. Tests incomplete held order masking, stable pagination, exact supplier membership, cross-store and anonymous denial, private-table direct read rejection, PII exclusion, and transaction rollback.
- `tests/supplier-review-fulfillment-queue-issue215.test.mjs`: unit tests for valid partial planning and draft tracking, complete/incomplete record shapes, wrong store, extraneous customer information, over-allocation, duplicate IDs/references, inconsistent revisions/quantities, unsafe status flags and nonpayable semantics.
- CI steps added to `Payout RLS isolated Postgres verification` after the Phase 1 shipment planning/race tests. Quality checks and Vercel preview must also pass on the PR HEAD.

## Future approval gates

Real source-origin server purchase capture (Issue #214), authorized seller/product/transport eligibility, KMS-managed restricted delivery access and consent, private supplier role-based tracking mutation and explicit version conflict responses, robust partial shipment lifecycle, immutable carrier-verified tracking events, refund/cancellation handling, and secure cumulative attachment/CSV reconciliation (Issues #216–217) must be designed and independently tested before enabling shipment or postage.

**The queue is a protected read-only review surface, not live fulfillment.**