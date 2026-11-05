# Track 2 — Read-only payment audit quality v1 (November 5, 2026)

**Scope:** existing administrator monitor only. No commercial release, payment, payout, refund, wallet, invoice, merchant credential, hosted migration, external provider request, or supplier data export is introduced.

## Existing authorized data sources

The protected `/admin/payment-monitor` page keeps its existing session-bound Supabase client, verified platform-admin guard, and RLS reads of `payout_rules`, `payout_transfer_records`, `payment_allocation_snapshots`, and store labels. It also keeps the single admin-only aggregate `get_admin_checkout_journal_overview` RPC. The new audit consumes *only* those already-loaded arrays, without issuing another database or provider request.

`assessAdminPaymentAuditSample` is a pure, read-only function. For each bounded group, it detects unexpected or duplicate record IDs, malformed timestamps, unknown rule or transfer statuses, invalid amount encodings, and invalid rule scopes or versions. Failures are reported using generic reason labels, not stored record IDs, wallet addresses, provider keys, recipient details, or raw source rows.

### Data coverage and risk interpretation

- A denied, missing, malformed, or oversized read is **unavailable**, not a successful empty result.
- Exactly `LIMIT=30` records implies **coverage unknown**, not proof that the database contains only 30 records.
- `recorded_sample_only` means no structural problems were detected among successfully fetched records. It is **not** evidence of payment settlement or complete transaction reconciliation.
- `review_required` requests an administrator's manual inspection; this view has no resolution, retry, refund or payout action.
- Existing `state='confirmed'` transfer rows are recorded statuses only. Provider observations, independent wallet receipts, and blockchain finality are not connected to this monitor.

Every result keeps `sourceCoverageVerified=false`, `providerSettlementVerified=false`, `canReleaseCheckout=false`, `canCreateInvoice=false`, and `canApprovePayout=false`.

## Verification and release boundary

Node unit tests cover missing data, empty readbacks, 30-row coverage limits, duplicate IDs, malformed source rows, amounts outside bounds, unknown statuses and preserved server-only access. Exact PR-head CI must pass lint, typecheck, unit tests, build and disposable PostgreSQL/RLS checks before merge. The matching Vercel preview must be ready. The existing production `apex_internal.private_release_gate.enabled` must stay `false`.

This read-only quality panel does not substitute for signed BTCPay webhook verification, independent provider readback, complete ledger reconciliation, wallet-finality checks or legal/payment release approval.
