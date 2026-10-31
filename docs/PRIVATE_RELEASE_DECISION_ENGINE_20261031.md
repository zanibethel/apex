# Apex — Private Publication Decision Engine, Pass 1
Date: October 31, 2026. Existing `zanibethel/apex` and existing Supabase `fhqpkpztercadcxspdkg`. **No second hosted database**.

## Purpose and non-goals

Build an authoritative, read-only **internal publication readiness decision**, rather than deriving customer-facing visibility from supplier intent, product internal approval or product attributes. This pass **never publishes products**, enables public product images, creates checkouts/orders, or accepts payments. The release engine remains structurally disabled until a separate documented public-release implementation and appropriate eligibility verification is reviewed.

SQL is **review only** at `database/sql/apex_private_release_decision_engine_REVIEW_ONLY.sql`, not applied to the hosted project. The production deployment is unchanged.

## Decision gates and priority

`public.get_private_release_readiness(store_id,product_id)` is an authenticated-only RPC returning `{status_code,effective_public:false,checks:{...}}`. It checks the verified platform-admin JWT claim or owner/manager membership itself and reads otherwise inaccessible private eligibility state. It is *read-only*, using SECURITY DEFINER with fixed `pg_catalog` search path; anonymous EXECUTE and direct eligibility table grants are revoked.

Prioritized blocks include:

1. Existing per-product admin hold or required-review gate.
2. Active same-supplier hold on a normalized product title, including a clone under a new SKU or a second store of that supplier.
3. Supplier has not requested publishing.
4. Pending/changes-requested **material content review**, insufficient required product information or currently available stock (on hand minus reserved).
5. Suspended/unverified/expired **supplier authorization** and blocked/unverified/expired **product-specific authorization**.
6. **Public release disabled** even after all preceding checks pass.

The internal eligibility tables are private and initialized to **unverified by default**. They are *not* a license check service or a claim that legal authorization was established. No supplier or public actor can self-certify. The future compliance workflow needs verified evidence, jurisdiction, authorization period and audit trail before it can update these records.

The `apex_internal.private_release_gate` table is CHECK-constrained to `enabled=false`, and the RPC always reports `effective_public:false`. Neither a supplier request, internal approval nor an admin override creates a public listing.

## Duplicate hold protection

A private admin hold creates a **frozen normalized-name identity block** associated with the supplier. New SKUs and equivalent punctuation/spacing of that name within the same supplier cannot request publication. Existing matching requests are cleared when the admin places the hold. Lifting the source hold deactivates its identity block but **does not restore previous supplier requests**. The data and enforcement are implemented by database triggers, not only client UI checks.

Limits: this is exact normalized-name matching, not comprehensive semantic, brand, formula, imagery, alias or cross-account duplicate detection. Renaming the product meaningfully or creating an unrelated supplier identity is **not fully covered**. Any future public release still needs a stronger supplier-wide block and identity/duplicate review before activation.

## Application

- `/supplier/catalog`: displays effective release decision and explanation. Missing RPC/schema gives a private, unavailable result rather than assuming eligibility.
- `/admin/listing-controls`: same server-evaluated status beneath admin controls.
- These pages do not use service-role secrets, publish products, grant storage access or expose eligibility evidence.

## Test coverage

Run `database/tests/private_release_decision_engine_integration.sql` in the existing CI disposable PostgreSQL 17 service after the previous supplier hold integration. It verifies tenant denial, admin visibility, incomplete seller authorization, exact-name clone protection, hold clearing duplicate intent, admin release not restoring it, positive synthetic seller/product authorization still resulting in **public_release_disabled**, expired/blocked product checks, and no public record changes. Node tests check the presentation's fail-closed behavior and the SQL's explicit release hard stop.

## Required future work before any public release

- Establish legally sufficient authorization and product eligibility verification, including seller credentials and jurisdiction restrictions; prohibit unsupported product categories.
- Design customer-facing **effective-public** read path that rechecks holds, supplier status and stock for every read or transaction, plus atomic admin takedown.
- Secure public image delivery; supplier-wide/semantic duplicate holds; independent security review and live rollback.
- Separately authorize commerce, payment acceptance, refunds and fulfillment.

Do **not** apply SQL to hosted Supabase until separately approved; historic Supabase migration version drift makes blind `db push/reset` unsafe. Capture hosted migration history in a follow-up audit after any authorized application.
