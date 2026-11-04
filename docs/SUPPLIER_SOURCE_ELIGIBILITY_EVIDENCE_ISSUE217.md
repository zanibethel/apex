# Apex Issue #217 — Phase 2: independent-source eligibility boundary

**Scope:** stacked review-only PR on #240 (and unmerged #239 → #238 → #237 → #236 → #235 → #214 chain). No production migration, checkout, buyer-address decryption, carrier-label purchase, shipment mark, or new email send.

## What the existing sources establish

The current canonical `public.supplier_sales_history` and `apex_internal.order_detail_snapshots` are separate stores of information. A sale with `sale_state='confirmed'` establishes a recorded sale-history observation; it is **not** independently verified payment finality or a right to ship. Every current order-detail snapshot is immutable and `held_unverified`, its `payment_authorized=false` and `fulfillment_authorized=false`, its order-line `product_eligibility='not_verified'`, and its protected destination `delivery_verified=false` and `shipping_authorized=false`. The shipment plan/tracking draft ledger is similarly review-only. Therefore **no order is independently eligible to be placed in an actionable fulfillment email**.

## Read-only audited connection

`database/sql/apex_supplier_report_eligibility_evidence_REVIEW_ONLY.sql` is a **disposable `apex_test` SQL script, not a production migration**. It installs only `public.get_supplier_review_report_evidence_gate(p_store_id uuid)` (stable read, security definer, no side effects). Every call requires a current non-anonymous Supabase user, supplier-membership lookup, and the global release gate disabled. It cross-checks current sale-history identity (store, reference, original purchase timestamp, amount and currency), observes current sale state and drift from original state, validates presence of original line counts, line subtotals, held audit hash and sealed delivery envelope without decrypting, and counts incomplete or changed held source records.

The projection exposes only bounded store-scoped **counts**, never order references, item titles/SKUs, customer addresses/contacts, payment credentials, ciphertext, keys, or source hashes. Recorded confirmed-sale observations are displayed separately from **independently eligible orders (always 0)**, outstanding product shipping approvals, and release readiness (always false). The database function cannot create a permit or change any state.

The supplier-only email preview now requires a complete held-order read and this independent source-count projection to agree on the store and number of original orders before rendering its review-only metadata attachment. If missing/inconsistent, it fails closed and does not create a downloadable attachment. If consistent, it explicitly displays the number held for review and **withheld from actionable fulfillment**. It does not send an email, claim delivery, or make any item shippable.

## Tests

- Isolated PostgreSQL acceptance: supplier self-read, current recorded-sale vs held counts, all shipping/payment/email release flags false, direct private table denial, missing-line held fixture increases withheld/incomplete counts, cross-store and anonymous denial, no side effects and full synthetic rollback.
- Node: source-consistent and source-incomplete cases, recorded confirmed sales never becoming shipment eligibility, strict output shape, counterfeited independent payment/product/address release flags, cross-store count and source drift rejection, empty store behavior, and route fail-closed linkage.
- Full application tests, lint, typecheck, build, isolated PostgreSQL suite and Vercel preview must pass at exact PR head.

## Remaining gating work

To produce an actual daily supplier fulfillment email, Apex still needs an **authoritatively signed and independently checked** payment finality observation tied to the same original purchase; permitted-product and permitted-destination review; approved shipment authorization; a recipient authorization and secure access policy; and production-grade provider delivery receipts. These have **not** been created by this PR. A Resend accepted HTTP response alone is not confirmation of inbox delivery. No real supplier email or package delivery is authorized.