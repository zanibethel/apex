# Apex Issue #215 — Phase 3: controlled tracking-draft entry

**Status:** Review-only and stacked on PR #236 → #235 → #234 → #233 → #232 → #231 → #230 → #229 → #228 → #227. No merges, production SQL migrations, shipment state changes, provider calls, customer delivery decryption, automatic labels, payments or inventory movement.

## Supplier experience

The protected `/supplier/fulfillment` queue now renders a small **Save tracking draft** form only for a store's authenticated **owner or manager**, and only when its membership-checked review queue data exists. A supplier staff member may see their authorized store's read-only planning queue but cannot submit a draft. The form contains a carrier (USPS/UPS/FedEx/DHL) and one bounded alphanumeric tracking reference, plus an opaque submission ID and the currently displayed shipment revision. The request ID is minted on the server for each rendered plan; retries of an existing form preserve that identity.

Submission uses a Next.js server action with `getSupplierWorkspace()` and verifies the requested store membership and owner/manager role. It calls the narrow `public.submit_supplier_review_tracking_draft` RPC **through the caller's own Supabase Auth client**, not through a privileged service-role client. The returned receipt passes a strict allowlist and all actual ship, carrier-verified, and postage flags must be false. On exact replay, the form reports that no duplicate was created; on success it invalidates the read-only queue and instructs a refresh before another change. A stale revision explicitly shows the requested and current revision plus the most recent carrier/tracking draft so the supplier can compare before retrying. Conflicting event or tracking references are clearly rejected with no silent overwrite. If the RPC is absent or denies access, the form fails closed.

## Database / access boundary

`database/sql/apex_supplier_tracking_draft_entry_REVIEW_ONLY.sql` is **only installed on disposable `apex_test`**, after the existing private held-order and review shipment ledgers. It is intentionally outside `supabase/migrations`. Every invocation requires the global private release gate to be **off**, authenticated non-anonymous `auth.uid()`, a live `stores → supplier_memberships` association with role in `(owner, manager)`, an existing same-store `review_only` plan, and a complete original held-order purchase/accounting/audit and sealed destination **existence** without decrypting. Input is checked again by the database, regardless of client validation.

The limited `SECURITY DEFINER` RPC delegates the atomic write to the existing internal `record_review_tracking_draft` implementation, which locks the canonical plan row and enforces a monotonic revision, idempotency key, unique store/carrier/tracking draft identity, immutable audit and original shipment status unchanged. An exact replay returns the existing stable outcome; a changed key or duplicated tracking is a `duplicate_conflict` with revision hints, and a stale form yields `stale_version`. The RPC returns only the relevant draft metadata, never source hashes, customer addresses, crypto keys, payout details or raw private audit tables. There are no direct app-role table write grants.

The form is inert against the actual production Supabase project because this database RPC and shipment planning ledger are **not installed there**. A separate explicit release process would be needed; installing it elsewhere without re-evaluating its hardcoded disposable-database check still would not authorize production shipment.

## Tests

- `tests/payout-rls/supplier-tracking-draft-entry-issue215.sql` creates a synthetic owner/manager role inside a transaction, tests initial draft, identical event replay, stale version with last-draft response, changed-event and duplicate-carrier/reference conflicts, revision increments, invalid strings and cross-store/unknown-plan rejections. It asserts that staff, other suppliers, anonymous users, and public callers cannot write, and the entire fixture rolls back with all commerce gates unchanged.
- `tests/supplier-tracking-draft-entry-issue215.test.mjs` verifies exact request and response shapes, wrong role and bad input, receipt revision arithmetic, non-shipping flags, input/PII injection and that the server action uses the existing supplier-authenticated client.
- Both the application quality checks and the isolated PostgreSQL security/concurrency suite must pass at the PR head, along with Vercel preview checks. No production merge or deploy is authorized by these tests.

## Remaining issues

Actual end-to-end original purchase source (#214), product/supplier/carrier authorization, KMS-backed selective delivery address access, real postage, tracking verification, cancellation/partial shipment transitions and secure supplier report attachments/import reconciliation (#216–217) remain separate approval and implementation steps. A tracking number entered here is **never** evidence that an item was physically shipped.