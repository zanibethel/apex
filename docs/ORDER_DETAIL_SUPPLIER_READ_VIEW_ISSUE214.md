# Apex Issue #214 — Phase 8: supplier-only held-order detail read

**Status:** Review-only, stacked on PR #233 → #232 → #231 → #230 → #229 → #228 → #227. No merging, migration to production, checkout, payment, shipping or USPS label purchasing. No decrypted delivery information is exposed.

## Scope

This slice extends the existing supplier order-readiness page with a protected detail page at /supplier/reports/order-foundation/details.

The page requires the existing getSupplierWorkspace() access check: fresh Auth user, confirmed email, current supplier membership and authorized store list. It calls a narrow private RPC for each store from that workspace. On a missing RPC, permission error, or malformed response, it displays unavailable — never invented orders. Rendering is server-side, dynamic and noindex.

The SQL RPC lives in database/sql/apex_supplier_held_order_details_REVIEW_ONLY.sql, intentionally NOT in production migrations. It refuses installation or invocation outside the disposable apex_test database and requires the global release gate to remain off. It is not deployed. Without a separately approved production migration, the page cannot show real order details.

## Security and returned fields

The SQL RPC is SECURITY DEFINER with pinned pg_catalog search path, explicit Supabase Auth identity and current supplier-to-store membership checks, rejection of anonymous identities and unbound stores, explicit EXECUTE grant solely to authenticated, and bounded page size 1–50 and offset 0–1000.

It reads protected immutable order metadata, not checkout or payment permissions. It returns only original order reference, purchase UTC timestamp, *recorded* sale state, original product title, SKU, variant, quantity and unit/line prices, plus immutable shipping, discount and gross accounting.

A held snapshot is displayed as complete only when all purchased line totals agree with the immutable accounting commitment, line count matches, an opaque protected destination exists, and the original success audit matches the store and source hash. Missing or contradictory records are shown as incomplete with no partial item rows or financial fields.

The query explicitly does NOT return delivery ciphertext, nonce, key reference, source hashes, customer name, address, email, phone, wallet, payout details or shipping-label links. All payment, shipment and decryption flags remain false. A source state of confirmed remains a recorded historical state, not a new payment authorization.

The accompanying strict parser rejects extra fields, wrong stores, incomplete-record leakage, inconsistent item arithmetic, incorrect chronology, forged readiness flags and malformed pagination. No client-side PII decryption or logging is added.

## Verification

- tests/payout-rls/supplier-held-order-details.sql uses the committed synthetic Phase 4 held order, and adds a newer intentionally incomplete record inside a rollback. It checks supplier-only access, immutable item quantities and amounts, pending-record masking, correct pagination, wrong-store and anonymous denial, lack of direct private-table access, and unchanged commerce gates.
- tests/supplier-held-order-detail-view-issue214.test.mjs checks the strict server-to-UI parser: canonical data, no extra sensitive fields, duplicate and out-of-order rows, exact subtotal, shipping/discount/gross checks, invalid numeric and encrypted state, and no write/decrypt/network capabilities.
- The full GitHub Actions quality and isolated PostgreSQL suites must pass on the PR head before review; Vercel preview checks must also pass.

## Remaining operational gates

An independently authenticated, truly server-owned purchase-capture source is still required before the private held snapshots can represent real purchases. A real deployment also needs explicit security review of the read RPC, entitlement controls and retention. Separately approve product/supplier and carrier eligibility, KMS-managed key rotation and decrypt-on-need, customer consent, refund/cancellation continuity, shipment event ledger and tracking updates, and secure cumulative daily report attachments.

Issue #215 fulfillment/tracking and Issues #216–217 report reconciliation remain separate work and may never infer new orders from a CSV upload or BTCPay event.
