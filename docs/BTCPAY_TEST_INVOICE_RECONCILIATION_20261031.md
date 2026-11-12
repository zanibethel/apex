# BTCPay Greenfield test-invoice reconciliation — isolated pass (2026-10-31)

**Status: CODE IN REVIEW; no host, invoice or production connection exists.** This change is intentionally stacked on the read-only BTCPay VPS readiness PR #104. It does not deploy an API endpoint, create invoices, write Supabase records, or move funds.

## Goal
Prevent a signed BTCPay webhook or an optimistic browser redirect from being mistaken for successful payment. A future worker must independently read the invoice using Greenfield **GET `/api/v1/invoices/{invoiceId}`** and match it against the pre-existing trusted order snapshot before any database transition.

## Added code
- `src/lib/payments/btcpay-invoice-reconciliation.mjs` validates an explicit testnet/regtest-only configuration; GETs an invoice using a store-scoped **`btcpay.store.canviewinvoices:<STORE_ID>`** read credential; rejects HTTP failures without forwarding upstream payloads; validates invoice ID, store ID, opaque order ID, exact USD cents and both BTCPay statuses.
- Accept only `New`, `Processing`, `Settled`, `Expired`, `Invalid` base statuses and explicitly identified `additionalStatus` values `None`, `PaidPartial`, `PaidOver`, `PaidLate`, `Marked`, `Invalid`. Unrecognized/missing values fail closed.
- `Settled + None` is classified as **`settled_invoice_reported`**, a read-only provider assessment; it does not imply wallet/chain independently attested, a product authorized for sale, fulfillment permission, or actual supplier settlement.
- All exception statuses, including `Settled + Marked` (manually marked) and `Settled + PaidOver`, are **manual-review** outcomes. `Processing + None` remains waiting for settlement; `Expired + PaidLate` does not grant credit.
- `inspectSignedTestInvoiceWebhook` combines the existing raw-byte HMAC validation and store/event check with a fresh authenticated invoice GET, validating the expected invoice and order snapshot. It only returns a sanitized assessment and delivery ID; **it does not deduplicate webhook deliveries or persist anything**.
- No new privileges, route handlers, server environment variables, background workers, wallet access, accounting writes or supplier/public catalog mutations.

## Review checklist
- `npm test`, lint, typecheck, build and existing disposable Postgres RLS integration checks all pass at the exact head.
- Confirm no floating-point price parsing, no network request on invalid config/snapshot, and no externally supplied browser totals or invoice IDs are trusted.
- Confirm the response to unknown/missing `additionalStatus` is fail-closed, and that credit/payout flags always remain false in this pass.
- Confirm API key read permission is separately store-scoped and stored outside the repo. No actual secret is stored or committed.
- Real service testing still requires DigitalOcean VPS provisioning, HTTPS DNS, regtest network verification, a **test store and wallet**, and a read credential. None have yet been created.

## Next reviewable pass after host provisioning
1. Establish isolated BTCPay regtest and verify `bitcoin-cli.sh getblockchaininfo` reports `regtest`. Only then run the read-only preflight.
2. Set up a separate invoice-creation key with `btcpay.store.cancreateinvoice:<STORE_ID>`, and register a store-scoped webhook with an independently protected secret.
3. Add a dedicated **test-only** order/invoice persistence contract, immutable event ledger, atomic deduplication by (store, delivery ID), order/amount reprice, quota checks, idempotent invoice creation, and a reconciliation worker. Require migration and RLS review before application.
4. Test real regtest Greenfield invoice created → worthless coin paid → independently fetched status and webhook retry; verify partial, late, overpaid, manual mark and reorg/failure recovery in the actual instance.
5. Test Prism two-recipient signing/forwarding and reconciliation separately. No automatic supplier/platform payout from a status event.

## References
- https://docs.btcpayserver.org/Development/ecommerce-integration-guide/
- https://docs.btcpayserver.org/API/Greenfield/v1/
- https://docs.btcpayserver.org/BTCPayServer/greenfield-authorization/
- docs/BTCPAY_TEST_SERVER_PROVISIONING_20261031.md (PR #104)
