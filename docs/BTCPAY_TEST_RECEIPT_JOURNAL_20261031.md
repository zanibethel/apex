# BTCPay test-only durable receipt journal — 2026-10-31

**Status: REVIEW-ONLY SQL and DISPOSABLE CI TESTS. NOT APPLIED TO HOSTED SUPABASE.** No BTCPay server, real invoice, wallet key, checkout route, background worker, receipt writer, blockchain transaction or payout is activated.

This is a follow-up to the test-server readiness PR #104 and read-only invoice verification PR #106. The customer-assistant plan is separately saved in PR #105 and remains deferred.

## Purpose
Before adding webhook endpoints or payment status writes, establish a durable, tamper-resistant PostgreSQL contract for *test network* inbound invoice records and signed webhook receipts.

### Three explicitly test-only journal tables
1. `btcpay_test_invoices`: trusted opaque order reference, Apex store, BTCPay store/invoice IDs, expected integer USD cents and strictly regtest/testnet chain label. Invoice IDs unique per BTCPay store; order refs unique per Apex store.
2. `btcpay_test_webhook_receipts`: composite primary key on (BTCPay store, delivery ID), invoice foreign key scoped to the same BTCPay store, event type, SHA-256 payload digest and receipt timestamp. Duplicate delivery IDs cannot create a second receipt, including when a replay changes the payload hash.
3. `btcpay_test_invoice_observations`: append-only read-only provider-status observations tied to the **exact** stored webhook receipt and invoice; one observation per delivery, with check constraints for valid status/additionalStatus/assessment combinations.

All three tables enable RLS. Only verified administrators may SELECT; anonymous users and supplier accounts cannot read journal details. Public, anon and authenticated roles have **no write grants**. UPDATE and DELETE trigger guards reject edits even from a privileged writer. There is no application write function or production migration in this pass.

## Important replay rule (future worker)
A unique constraint prevents duplicate inserts, but `ON CONFLICT DO NOTHING` **must not be treated as successful acceptance of a different payload**. An eventual trusted worker must compare the existing digest, invoice ID and event type with the newly verified delivery, all inside a transaction. If any differ: raise an incident/manual review and never credit or pay out. A repeated **identical** delivery is an idempotent no-op. Account for a valid redelivery with a different delivery ID separately and inspect BTCPay `originalDeliveryId`/redelivery metadata when available. Webhooks may arrive out of order.

No webhook event or even `Settled` invoice status alone authorizes order credit, fulfillment or a payout; a later worker must independently re-fetch Greenfield status, enforce trusted order snapshots, test network attestation, settlement policy and any applicable merchant/compliance approval.

## Tested in disposable PostgreSQL
The existing `.github/workflows/payout-rls.yml` applies the proposed SQL to an ephemeral PostgreSQL 17 instance, *never* Apex hosted Supabase, and runs `tests/payout-rls/btcpay-receipt-journal.sql` to assert:
- Same delivery ID in **different** stores is allowed, same-store duplicate is not inserted again.
- Conflicting same-store payload hash, duplicated invoice, cross-store invoice reference and cross-invoice observation are denied.
- Invalid provider status/assessment combinations fail.
- Journal UPDATE/DELETE operations fail under owner context.
- Anonymous read privilege is absent; browser users have no insert/update/delete grant; admin reads exactly the expected records and non-admin reads none.

These tests do not claim cryptographic remote webhook verification, production rollout, safe concurrent worker transactions or an active Bitcoin network. Those remain separate implementation gates.

## Next implementation pass
1. Confirm PR #104 → #106 review/merge order without unreviewed Vercel production deployment.
2. Provision the selected DigitalOcean test VPS with explicit recurring-spend approval; validate HTTPS and regtest chain independently. Create one synthetic store/wallet and narrowly scoped API key.
3. Implement a test-only authenticated webhook route + transactionally idempotent trusted worker, using the existing signature verification and the above receipt schema **only after a separately approved hosted migration**. Re-fetch Greenfield invoice for each event; capture every outcome as immutable observations; do not trust browser totals.
4. Prove actual regtest invoice creation and payment with worthless coins; test duplicate/out-of-order events, paid-late, partial/overpayment, interruption/retry and reorg behavior.
5. Verify Prism on the selected BTCPay version with isolated test wallets before proposing any live payout activation.

## Documentation
- https://docs.btcpayserver.org/API/Greenfield/v1/
- https://docs.btcpayserver.org/Developers/api/
- `docs/BTCPAY_TEST_INVOICE_RECONCILIATION_20261031.md`
- `docs/BTCPAY_TEST_SERVER_PROVISIONING_20261031.md`
