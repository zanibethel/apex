# Issue #214 Phase 3 — atomic held-order persistence (disposable-only)

**Status:** isolated PostgreSQL implementation for review, stacked on PR #228, which itself depends on PR #227. **Not deployed. Not merged. Not a real intake connector.**

## Scope

`database/sql/apex_order_atomic_intake_REVIEW_ONLY.sql` has a hard `current_database() = 'apex_test'` preflight. It does not belong to `supabase/migrations` and fails if applied to production. There is **no API route, scheduler, client call, cryptographic key, USPS call, BTCPay call, inventory mutation or live customer data access**.

It creates a narrowly defined **security-invoker** SQL function in the unexposed `apex_internal` schema. Permission to execute is revoked from PUBLIC, `anon`, `authenticated`, and `service_role` when present. At this phase, only the disposable test DB's administrator invokes it. A later restricted worker identity and independently authenticated event source require a separate approval, implementation and verification.

### What one DB call guarantees in the disposable fixture

- Locks the existing private release-gate row in disabled state, then locks the existing source sale `FOR UPDATE` so competing ingestion for the same sale waits.
- Rechecks that the source sale identity, store, original purchase time, gross, currency and payment state match the independently recorded sale.
- Checks **all** submitted line item structures, per-store product foreign keys, ordering, quantity/price bounds and line references; recomputes `sum(quantity * unit_price) + shipping - discount = gross` before insertion.
- Checks the opaque encrypted destination's format, canonical padded Base64, 96-bit nonce, permitted ciphertext size, 128-bit authentication tag and permanently held flags. PostgreSQL **does not decrypt, verify GCM authentication or claim address deliverability**. Actual authenticated encryption occurs in Phase 2's application-side preparer.
- Inserts one immutable canonical header, all lines, sealed delivery, a line-count/accounting commitment, and one confidential append-only audit entry in a **single PostgreSQL statement/transaction**. A failure after inserting any earlier record causes complete rollback.
- Treats exact signed-event hash replays with equal persisted line identities/amounts and accounting as `identical_replay` with no new event or writes. Source identity with a changed hash or recorded lines is a conflict. A valid retransmission may use different randomized GCM nonce/ciphertext; these are never overwritten.
- Keeps `fulfillment_authorized`, `shipping_authorized`, `payment_authorized`, `delivery_verified` false, and `product_eligibility = not_verified`. No customer address, payment credentials or raw signed event are saved in audit.

### Tests

`tests/payout-rls/atomic-held-order-persistence.sql` uses synthetic sales and opaque byte strings within a rollback in the disposable `apex_test` PostgreSQL database. Cases include two-line atomic success; exact replay with different sealed nonce and one audit entry; source hash conflict; altered line quantity, shipping or discount amount; invalid or cross-store sealed destination; invalid product ID on the **second** line, proving header/first line/destination/accounting/audit do not partially survive; append-only enforcement and supplier role denial.

CI loads this after Phase 1 private-order schema and before other isolated test fixtures. Run `Payout RLS isolated Postgres verification` and `Apex quality checks`; both must pass before review.

### Remaining blockers for Phase 4

1. Independently authorize the source and its *actual* signature format; the HMAC in Phase 2 is only a proposed protocol. Do not sign browser/CSV input and call it an authenticated purchase.
2. Dedicated least-privilege database worker role, private network/database binding, time-bound replay journal, source-origin verification and audit of failed attempts; no privileged general-purpose endpoint.
3. Production migration reviewed **separately** with rollback/recovery and secret/key management, table/schema grants, dual-control signoff and appropriate data retention.
4. Secured app-side decryption for authorized supplier fulfillment only; privacy and destination validation; partial/refund/cancel event continuity.
5. Product/supplier shipping eligibility and carrier/account terms approval; then Issue #215 fulfillment state and tracking, #216–217 cumulative duplicate-safe uploads and protected daily report attachments.

**Important:** Passing these database tests proves synthetic atomicity only. It does not show that any Apex catalog item may be sold or shipped, nor that any actual order source has been integrated. Keep the global release gate and all live checkout and label purchases disabled.
