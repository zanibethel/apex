# Apex — verified quote evidence and held-order expiry contract (PR #192)

## Scope
Extends the previously merged **synthetic atomic-reservation contract** (#191) with independently admitted shipping/tax quote *evidence records*, one-time cancellations, and expiry reclamation. All SQL is under `database/sql/*_REVIEW_ONLY.sql`, refuses to load outside disposable database `apex_test`, and uses a schema named `apex_test_reservation`. Nothing in this PR creates a production migration, customer order endpoint, BTCPay invoice, product release or live stock reservation.

## Trusted quote evidence design
The database contract separates (a) a shipping or tax amount offered by a quote provider from (b) a separate verifier's admitted evidence receipt. An evidence record binds **quote reference, provider identity, verifier identity, store, canonical cart SHA-256 fingerprint, destination region, USD amount, currency, expiry and payload digest**. Provider/verifier identities for tax and shipping must be distinct. The evidence is immutable once inserted. The reservation wrapper locks both quote records and admitted receipts `FOR SHARE`, rejects missing, inconsistent, modified, expired or unverified evidence, then calls the existing atomic reservation function in the same transaction. The held reservation deadline is no later than 15 minutes and the expiry of either quote; replay does not extend it.

**Evidence limitations:** The verifier/source identities and receipts in this PR are **synthetic test data**, not externally authenticated provider messages. The payload digest detects accidental/malicious edits to bound quote fields **after evidence admission**, but it is **not** a provider signature. A real issuer adapter must validate cryptographic signatures or mutually authenticated API responses with protected credentials, enforce permitted destinations and product eligibility, and persist only independently verified receipts. An untrusted client cannot simply mark a quote approved. No tax/shipping provider integration or true rates have been configured yet.

## Cancellations and expired holds
Orders in the test-only contract transition from `held_fixture_only` exactly once to `cancelled_fixture_only` or `expired_fixture_only`. A terminal transition:

1. Locks its order row `FOR UPDATE` (so cancellation/expiry races serialize).
2. Validates expiry deadline for `expire`; a hold cannot expire early.
3. Decrements reserved inventory with a per-item nonnegative guard and checked row count, inside that transaction.
4. Updates the order's terminal state and release reason and inserts a unique, immutable-intent release event.
5. Replays the terminal result without releasing stock again. Expired/cancelled idempotency keys cannot create a new reservation.

An `expire_due_holds(limit)` contract scans due holds in a bounded batch with `FOR UPDATE SKIP LOCKED`. No cron job or worker is deployed; concurrency and expiry are exercised only by disposable CI tests.

## Verification
The isolated PostgreSQL suite checks valid evidence, tampered amount/expiry rejection, missing or forged verifier receipt denial, immutability, early-expiry rejection, cancellation, repeated cancellation, expired-batch idempotency, and terminal idempotency. A two-session shell test concurrently attempts `cancel` and `expire` for the same due hold and proves **one event, zero reserved units, and one consistent terminal state**. Existing oversell, duplicate-request, BTCPay safety, Node guardrails, TypeScript and production preview checks remain part of CI.

## Production readiness gate
Future live integration still requires trusted shipping/tax providers or documented manual, independently authorized rate policy; tax jurisdiction rules; regulated-product eligibility and merchant approval; approved payment-wallet plumbing; customer identity and delivery validation; controlled reservation worker, signed webhooks, reconciliation and cancellation/void/refund paths. The **public catalog release gate and customer checkout remain disabled** and the existing real order-intent journals must remain empty.

This is engineering groundwork, **not** production shipping, tax, or payment verification.
