# Apex private checkout order journal foundation — PR #188

## Scope
This pass creates a durable **held-only** database structure so future payment integration can be built without treating external invoice calls as fire-and-forget operations.

**It does not create a customer order API, submit a BTCPay request, expose a checkout, charge money, approve products, reserve stock, or mark anything paid.** All 63 saved Apex products continue to have zero inventory, and the separate public-release gate remains off.

## Database and permissions
- `apex_internal.checkout_order_intents`: immutable request fingerprint, cart fingerprint, store identity, USD total (integer cents), item count, and creation time. `unique(store_id,idempotency_hash)` rejects the same request being inserted twice per store. Initial and only state: `held_no_payment`.
- `apex_internal.btcpay_invoice_post_intents`: a separate held-only intent for a *future* provider POST. Composite foreign key binds it to the same store as its order; an insert trigger checks exact USD amount. One row per order and one provider-reference combination. Initial and only state: `held_no_post`.
- Both tables are located in a private schema with row-level security forced, no policies or public data API grants. Anon/authenticated users cannot read, insert, update or delete rows. Immutable triggers block update and delete, including for maintenance operators.
- `public.get_admin_checkout_journal_overview()` is the only new callable function. It confirms `app_metadata.apex_role=platform_admin`, returns only aggregate held-record counts and literal disabled flags, and does not expose request hashes, order identities or personal information.
- The Admin **Payment monitor** now reads the aggregate and visibly distinguishes held infrastructure records from actual orders/invoices.

## Verification
CI applies the migration to disposable PostgreSQL, checks anonymous/supplier denial, exact order/provider amount coupling, immutable records, repeated-request denial, provider reference uniqueness, no public catalog release, and admin-only summary. Synthetic records roll back before the fixture exits.

Install production schema only after passing full quality, isolated PostgreSQL and Vercel preview. Production install creates **empty** tables. No test fixtures, keys, transactions, invoices, wallets or external network requests are applied to the hosted database.

## Next integration passes
1. Define product-eligibility, inventory and server-calculated quote admission with a fully authenticated order controller; never trust browser subtotals.
2. Add an independently audited, durable authorization + commit-before-network reservation workflow and least-privilege production worker. Treat uncertain external outcomes as **held**, never automatic retry.
3. Add validated provider webhooks, independent provider readback, append-only observations, reconciliation and split-activation controls.
4. Verify legal/product release, merchant requirements, and funds-handling approvals before authorizing customer transactions.

Existing regtest workers are useful verification infrastructure but **are not a production worker**. This migration does not permit real provider operations.
