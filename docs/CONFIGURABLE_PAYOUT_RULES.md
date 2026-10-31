# Apex configurable payout rules — admin design

**Status: design only, not enabled for checkout or automatic payout.** This replaces fixed-recipient and fixed-90/10 assumptions. The admin dashboard owns allocation configuration; the settlement adapter only executes a validated, approved allocation snapshot.

## Admin interface
- Payments > Recipients: create, verify and deactivate payees; assign roles (supplier, platform, partner, other); maintain network-specific payout destination records and verification state. Never store seed phrases/private keys in application storage.
- Payments > Rules: create draft, preview, schedule, activate, pause and archive rules. Support storefront defaults, supplier overrides and product overrides; one active matching rule per scope/effective time.
- Payments > Simulator: input a synthetic order, preview the winning rule, recipients, exact satoshi allocations, rounding and network fee policy.
- Payments > Transactions: view source order, applied rule version, gross/fees/net basis, allocations, delivery/settlement states and audit events; export reconciliation.
- Permissions: only authorized admin can publish changes; supplier can view only their own entitlements and wallet destinations. Require step-up verification and dual approval for material changes before production.

## Configuration model (proposal)
- `payout_recipients`: id, display_name, type, status, created_by, timestamps.
- `payout_destinations`: recipient_id, chain_network, address_or_provider_ref, verified_at, status, version; test and production networks isolated.
- `payout_rules`: id, scope_type (storefront/supplier/product), scope_id, status (draft/scheduled/active/paused/archived), priority, effective_from/to, currency_basis, fee_policy, version, created_by, approved_by, timestamps.
- `payout_rule_allocations`: rule_id, recipient_id, kind (percentage/fixed), basis_points or fixed_minor_units, ordinal. No recipient or percentage is embedded in code.
- `payment_allocation_snapshots`: order_id, rule_id/version, applied_at, gross_sats, fees_sats, distributable_sats, immutable ordered allocation JSON, hash; no historical edits.
- `payout_entries`: allocation_snapshot_id, recipient_id, amount_sats, destination_version, state, provider_transfer_id, idempotency_key; append-only event history.
- `payout_audit_events`: actor, action, before/after hash, approval reference, timestamp.

## Rule precedence
1. Exact product-specific active rule.
2. Supplier-specific active rule.
3. Storefront default active rule.
If no valid active rule matches, fail closed: no payment capture/forwarding. Reject overlapping active rule intervals at the same scope. For multi-product baskets, allocate per line item first, then aggregate by recipient; do not apply an arbitrary product override to the whole basket.

## Arithmetic and validation
- Integer minor units and integer satoshis only; no floating-point monetary calculations.
- Percentages stored as integer basis points (1 bp = 0.01%). Require total percentage allocations to equal 10,000 bp after any defined fixed deductions, with a documented basis and fee policy.
- For fixed amounts, explicitly specify whether they apply per order or line item, whether they are deducted before percentage splits, and enforce total fixed <= available distributable amount.
- Use deterministic largest-remainder allocation for satoshi dust, with a stable recipient-ID tie-break; all outputs must sum exactly to the distributable amount.
- Validate minimum output/dust thresholds, address network, verified destination, recipient status, and actual processor capability before payout. Insufficient funds, unsupported number of outputs, and rounding conflicts must block execution, not silently reallocate.
- Support arbitrary recipient counts in the rule model; enforce processor-specific operational limits only at settlement validation (not hardcoded to two, three or ten).
- Fees/refunds/chargebacks must be defined separately from commission percentages; reversing a payment must not overwrite the original allocation.

## Activation safety
- Draft/preview/approval and audit are independent of actual forwarding.
- A signed BTCPay event is only a notification; verify invoice state via authenticated API and deduplicate deliveries before ledger updates.
- No claim that Prism supports an arbitrary number of recipients until tested on the chosen version/network; if it cannot, the adapter must reject unsupported rules rather than send partial funds.
- Do not enable production payments, migrations, payouts or admin editing on live site through this design document alone.

## Next reviewable implementation passes
1. SQL schema, RLS policies, migration tests and allocation math tests in isolated development.
2. Admin-only draft rule CRUD + preview UI, no activation.
3. Rule versioning/approvals, snapshot ledger and supplier read-only views.
4. Real BTCPay regtest invoice lifecycle + Prism multi-recipient capability test.
5. Approval and release gate for production settlement.
