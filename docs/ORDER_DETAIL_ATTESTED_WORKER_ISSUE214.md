# Issue #214 — Phase 4: disposable attested worker and confidential denial journal

**Review-only.** Stacked on PR #229, then #228 and #227. This adds **no production migration**, no API endpoint, no Supabase Edge Function, no live source connector, no webhook, no email attachment, and no customer order ingestion. The global release gate remains disabled.

## Security boundary

`database/sql/apex_order_test_attested_worker_REVIEW_ONLY.sql` is installation-blocked unless the database name is exactly `apex_test` and the release gate is off. A unique PostgreSQL `LOGIN` is created during isolated CI with a temporary, masked 256-bit password. Its attributes are `NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, and it is not a member of another role. It has **no direct table grants**, no `apex_internal` schema access and no privilege to run the original atomic writer.

Two narrowly scoped, `SECURITY DEFINER` functions exist only in the unexposed `apex_test_order_worker` schema, with pinned search path, explicit `session_user` checks, and `EXECUTE` exclusively granted to this dedicated test worker.

### One-use synthetic source permit

An **independent CI administrator**, never the worker, seeds a store/record/hash-specific, expiring permit. An active private store-to-worker binding is also required. To call the wrapper, the worker must present the randomly identified permit with a matching immutable source sale ID, store and signed-source SHA-256. The wrapper locks and consumes the permit inside the **same transaction** as the canonical held order, purchased items, sealed delivery, financial commitment and append-only success audit.

A failed transaction rolls the permit consumption back. An already consumed or expired permit is denied. An independently minted second permit for the **same** original source event can return `identical_replay` without another order or success audit. Changes to the source payload, order lines, store, or verified historical sale are denied by the chained atomic writer.

**Important boundary:** the example permit is seeded by the synthetic CI fixture, not created from an actual supplier, BTCPay, checkout or any signed production event. This is a demonstration of **separation of authority**, not a genuine external signature-verification integration.

### Confidential failure journal

Because PostgreSQL exceptions roll back writes within the failed transaction, rejected events are documented through a **separate, successful, narrowly scoped call**. The denial record contains only bound store ID, SHA-256 of source bytes, a fixed allowlisted denial code, the dedicated worker role and UTC time. There are no names, addresses, phones, email addresses, raw payloads, payment details, decrypted bytes, cryptographic secrets, or exception stack traces. The table has forced RLS, no client grants, and an immutable mutation-denial trigger.

The caller must explicitly make the separate audit call after handling an error; this test-only layer does not guarantee that all crashes or transient failures have been durably audited. A future production integration must add a robust retry/outbox mechanism with independent monitoring.

## Test coverage and CI

GitHub Actions `Payout RLS isolated Postgres verification` now:

1. Runs the existing Phase 1–3 tests, including two-session replay/locking proof.
2. Generates and masks a fresh CI worker password and creates the narrowly authorized non-admin role.
3. Independently seeds synthetic store binding, historical sale and four permits (two valid, one reserved for a rejection, one expired).
4. Logs in as that actual database role and verifies that private tables, the base writer, expired/reused permits, wrong supplier and unallowlisted denial codes are inaccessible.
5. Verifies new held snapshot, independently reattested no-op replay, rollback of a mismatched line, and one separately recorded minimal denial.
6. Verifies **exactly one** order header, two lines, one sealed destination, one accounting row, one success audit and one denial event; confirms the global release gate and checkout/payment intents stay unchanged.

All fixtures are synthetic and remain on disposable `apex_test` PostgreSQL only.

## Remaining before any connected operation

- Identify and independently approve a real signed source, including its actual authentication method, event replay semantics, scoped identity and key rotation. Never mint a valid permit for an unsigned CSV, user-supplied browser JSON, or fake purchase.
- Build a deployed restricted-worker process and separate independent attestation service, using secret management, database transport protection, robust timeout/retry behavior and alerts. None exists yet.
- Reviewed production migration plan with RLS, privacy/retention rules, backup/restore, secret key lifecycle, and independent security signoff; deployment currently blocked.
- Authorized destination decrypt-on-need and address validation; product/supplier/transport eligibility decisions before any fulfillment.
- Issue #215 fulfillment and tracking state and Issues #216–#217 cumulative reports and secure attachments remain future, separately gated slices.
