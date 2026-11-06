# Development Track 3 — Next piece: audited shipment ledger and partial-fulfillment foundation

You are Development Track 3 for **Apex Anabolics**.

**Repository:** `zanibethel/apex`  
**Stack:** Next.js, Supabase/PostgreSQL RLS, Vercel, Resend, USPS integration  
**Target:** December 1, 2026 technical readiness (not automatic public-commerce activation)  
**Starting checkpoint:** `docs/APEX_EXECUTION_CHECKPOINT_2026-11-06.md`, especially **PRs #298, #299, #300**. Their latest verified merged baseline is `c182b977bbe2bbc441b7f3a46ad68ab1a7c2198a`. Re-read current main before changing anything; another chat may have advanced it.  
**Related Issues:** #214, #215–#219.  
**Work branch:** `feat/apex-supplier-shipment-ledger-foundation` (new branch from current main).

**Goal:** Build the **next small, reviewable part** of real supplier order operations: a secure, supplier-scoped, versioned and audited shipment/partial-allocation data foundation that can eventually support eligible paid orders. Don't create another product database, duplicate orders, or another scattered dashboard. Build on the existing `/supplier/orders` and `/supplier/orders/[orderId]` experiences, immutable order IDs and original purchased-line snapshot schema.

## Inspect first

Inspect the current repo and deployed schema, the latest checkpoint, the current private `apex_internal.order_detail_snapshots`, `order_line_snapshots`, `order_delivery_envelopes`, `supplier_sales_history`, the versioned read RPCs, `review-only-fulfillment-state.mjs`, the existing synthetic fulfillment QA, CSV overlap logic, the current supplier membership/RLS conventions, and relevant open branches/PRs. Identify existing code to reuse before writing any new tables or actions.

## Implementation — bounded sequence

1. **Canonical identities:** Design an additive private shipment / allocation / event schema referencing the existing immutable `order_id`, `line_id` and `store_id` with immutable original purchase timestamp. A unique shipment ID and idempotency key must make repeated requests safe. Do not rewrite saved purchases, derive order identity from product names, or create a second order source.
2. **Partial fulfillment:** Support planning more than one shipment for an eligible order, per-line integer quantities, remaining quantities, cancellation/exception semantics and strict sum-of-allocations <= purchased units. Prevent overshipment from concurrent sessions; use transactional database constraints/locks, not UI-only validation.
3. **Auditable lifecycle:** Define queued → under review → packing → label ready → shipped → delivered, exception and cancelled. Each valid future transition needs an actor, timestamp, reason/metadata, previous/next state, monotonically increasing revision and immutable append-only history. A stale expected revision must reject cleanly. Illegal transitions or duplicate events must never silently succeed.
4. **Authorization boundary:** Store/source membership, owner/manager permissions, anonymous denial and cross-supplier isolation are mandatory. Most importantly, the existing `held_unverified` order rows are **not eligible**. A recorded sale marked "confirmed," a supplier's Publish switch, a CSV, a no-stock-tracking preference, or a caller-supplied `approved` flag must not unlock shipping, addresses, payment, tracking or labels. Regulatory eligibility, true payment settlement and shipping permission must come from a distinct independently validated trusted source, currently unavailable.
5. **Narrow UI:** If safe and implemented, add a small **Shipment planning / history** section to the existing supplier order detail, displaying quantities remaining and clearly marked **Review only / Not authorized to ship**. Preserve existing mobile layout and current private hold indicators. Do not add operational carrier buttons to an unverified order.
6. **Tracking contract:** Specify a future versioned event structure for tracking number, carrier, shipment identity, revision, event actor and timestamp, including replay/stale checks. Do not send carrier requests or accept real tracking updates until the separate eligible-order and carrier authorization paths have been tested.
7. **CSV/email integration points:** Preserve one original order ID through daily reports and cumulative CSV; specify duplicate-safe import/export and carried-forward unfulfilled logic. Do not persist uploaded CSV edits as shipment authority, and do not send unverified order/customer details in email.

## Tests and gates

Write real tests for owner/manager versus staff/anonymous/cross-tenant access; immutable IDs; duplicate request and event replay; same-key/different-payload conflicts; two-session stale-version races; partial shipments that sum exactly to purchased quantities; over-allocation and negative quantities; cancellation/exception paths; invalid state transitions; held-order hard denial even if client flags claim eligibility; and no customer PII or credentials in outputs. Prefer isolated disposable PostgreSQL integration, not only mocked Node tests.

Run exact-head lint, TypeScript, Node guardrails, Next production build, isolated RLS/concurrency tests, and Vercel preview. Keep schema migrations additive and auditable; check hosted schema history before applying anything. Open a small PR, merge only after all checks and independent verification, then verify the exact main SHA and deployed state. **Do not turn on public release, live checkout/BTCPay, USPS label purchasing, destination decryption or actual shipping.** This task is an audit-safe technical foundation, not shipment activation.

## Deliverables

- The implemented, tested slice with PR link/number and exact commit.
- A simple explanation of what suppliers can now see or do versus what remains disabled.
- Any migration names and the actual apply/readback state; do not imply a hosted migration succeeded without verification.
- Updated `docs/APEX_EXECUTION_CHECKPOINT_2026-11-06.md`, `docs/APEX_TRACK3_ACCEPTANCE_TEST_PLAN_2026-11-05.md` (or a dated addendum), and Issue #215.
- The smallest next task after this PR, including how I should test it on mobile.

**Work autonomously through the inspection, implementation, and testing. Avoid another planning-only response. Prioritize one safely completed and merged change over a broad unverified rewrite.**
