# Apex supplier operations and payout proposal staging

## Scope
One shared Apex storefront; Lily = supplier owner, Tierra = supplier manager, platform operator = admin. Existing supplier memberships enforce shared tenant scope.

### Supplier pages
- `/supplier/catalog`: list products, create/edit **draft-only** product and category records; no publishing.
- `/supplier/inventory`: on-hand, reserved and available counts; authenticated stock changes use compare-and-swap to prevent overwriting another operator, with database audit.
- `/supplier/reports`: first 100 **verified sales report entries only**, no user inserts, no fake revenue. Empty state until a trusted sales ingestion/settlement integration exists.
- `/supplier/wallets`: pending **Bitcoin signet-only** destination requests; never stores or asks for private keys; no approved destination or transfer capability.

### Admin pages
- `/admin/splits`: propose a supplier percentage (default planning baseline 90%) and complementary platform percentage (100 - supplier%). Server authorizes via fresh `auth.getUser()` and trusted `app_metadata.apex_role`. RLS checks administrator role as secondary protection. Changes are audited and do **not** affect actual payouts or payment processors.

### Database review
- `database/sql/apex_supplier_operations_review.sql` is staging/review SQL. It was **not automatically applied to the connected Supabase database** by committing the PR.
- `database/tests/supplier_operations_integration.sql` tests the actual SQL in a disposable PostgreSQL instance after the original catalog foundation test.
- All new exposed tables have explicit RLS and least-privilege grants. Supplier draft changes cannot publish products or move existing records between stores.
- Catalog and stock changes create immutable audit rows through locked-down, non-exposed trigger functions.
- Existing products/inventory tables remain unmodified until SQL is intentionally reviewed and applied to the Apex development database.
- Any future product photo upload requires separate secure storage policies and content validation.

### Feature flags (server only, default OFF)
- `APEX_DRAFT_CATALOG_WRITES_ENABLED=true` allows draft product/category creation/editing and quantity updates.
- `APEX_WALLET_REQUESTS_ENABLED=true` allows signet wallet requests to be recorded. Never activates payouts.
- `APEX_SPLIT_DRAFT_WRITES_ENABLED=true` allows admins to save audited proposed percentages. Never activates payouts.

Never use `NEXT_PUBLIC_` for these flags, and do not expose any privileged Supabase service keys in browser code.

### Release checklist
1. CI lint, typecheck, guardrail tests, disposable PostgreSQL RLS tests and Vercel build must pass.
2. Review SQL grants, RLS, locked-down triggers, and CI isolation results; apply reviewed SQL in staging only.
3. Enable **catalog draft** flag in Vercel Preview only. Test Lily and Tierra can edit their common draft products, neither account can access another tenant, and non-members are denied.
4. Confirm category and SKU validation, concurrency behavior, audit identity and rollback/recovery.
5. Enable wallet request and admin split draft flags only after dedicated flow reviews; require MFA/step-up authentication and a dual-control process before *any* future live wallet or payout destination modification.
6. Obtain actual approved supplier product descriptions, prices, categories, images and starting quantities. No catalog data has been imported and no real sales data exists. Do not make up entries.
7. Keep `main` / production release separate from staging; do not enable checkout, order placement, live BTC movement or settlement until separate authorization and ledger/reconciliation gates pass.

## Architecture clarification
A draft percentage is a proposal, not a committed executable payout instruction. The proposed BTCPay Server + Prism payment integration must have its own approval/versioning, signer and two-destination verification process. Actual payout calculations use integer satoshis and immutable effective-at-time settlement snapshots; changing a future percentage cannot retroactively alter prior transactions.
