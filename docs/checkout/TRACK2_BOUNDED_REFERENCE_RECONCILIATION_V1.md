# Track 2 — Bounded payment-reference reconciliation v1

**Scope:** Existing admin-only, read-only `/admin/payment-monitor` reporting. No order creation, checkout admission, invoice POST, payout execution, wallet read, supplier fulfillment, or payment release.

## Relationship coverage

The admin page uses its existing RLS-protected data sources, adding only selected, non-secret relationship columns:

- `payout_rules`: unchanged metadata, including rule ID, version, creation time.
- `payment_allocation_snapshots`: adds `rule_id`, `rule_version`, `gross_sats`, and `distributable_sats` to the same 30-row read.
- `payout_transfer_records`: adds `snapshot_id` to the same 30-row read.

`reconcileAdminPaymentReferencesV1` compares sampled snapshot rule IDs and versions to sampled rule rows; it compares transfer snapshot references with sampled snapshot IDs and checks that recorded transfer timestamps do not predate recorded snapshot timestamps. It also checks sample-level snapshot amount integrity (`0 <= distributable <= gross`) and basic ID/time integrity. Each output is aggregate counts, a sampled timestamp span, and generic reason labels. The results never publish raw order IDs, recipient IDs, provider references, wallet data or keys.

## Important distinctions

**Absent in a limited sample is not missing from the database.** Each source is independently sorted by creation time and capped at 30 recent rows. A valid transfer reference may point to an older snapshot not included among the most recent 30; likewise an allocation snapshot may reference an older rule. Such relationships are counted as `...OutsideSample`, not flagged as broken foreign keys or missing payments.

A version or impossible timestamp contradiction among *present* references is shown as `review_required`; it is not an automated remediation or statement that settlement failed. A rejected read, malformed record, or oversized sample does not establish historical completeness.

The `observedWindow` fields only summarize the oldest and newest `created_at` values across currently sampled records. They are **not** an immutable audit trail and they do not attest the actual time a blockchain transaction, invoice or payout occurred.

All returned flags remain `completeHistory=false`, `providerEvidenceConnected=false`, `independentSettlementVerified=false`, `canReleaseCheckout=false`, `canCreateInvoice=false`, and `canSendPayout=false`.

## Verification

Unit tests cover matching references; references outside the read window; version and timestamp contradictions; invalid money, references and times; denied/partial/oversized reads; and the unchanged admin authentication, no extra RPC and no-write boundary. Require the exact pull-request commit to pass Node tests, lint, typecheck, Next build, disposable PostgreSQL/RLS and Vercel preview before merge.

**Release remains disabled.** Separate provider evidence ingestion, signed webhook and independent wallet confirmation are needed for true payment reconciliation. A transactional order writer or production payment authorization is not part of this PR.
