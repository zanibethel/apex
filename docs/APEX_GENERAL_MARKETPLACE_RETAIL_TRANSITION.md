# Apex → General-Purpose Marketplace · Neutral Retail Transition

State: planned reversible data migration; **not an authorization to accept payments**.

## Why this transition

Apex is being developed as a transferable, multi-supplier marketplace product, not as an active pharmaceutical retail outlet. The historical saved catalog is a development artifact, not proof of inventory, public release eligibility or actual orders.

## Historical product archive

Migration `20261109233000_apex_archive_legacy_and_seed_neutral_retail_v1.sql` adds `public.products.archived_at` (nullable). The migration contains an explicit manifest of exactly **63 historical unpublished IDs** belonging to the current draft supplier store. It fails closed if any expected ID is not present and unpublished; it archives only those IDs. It never deletes or renames products, modifies their prices/images/stock, or touches their order/audit references. Original active flags are retained, and restoration is reversible via a separately reviewed admin recovery migration.

- The database prevents an archived product from being publicly published via an explicit check constraint.
- The active supplier Products workspace, detail preview, private showroom, supplier chat and edit paths filter `archived_at IS NULL` (including direct ID actions).
- Admin users can review historical metadata at `/admin/catalog-archive` using existing authentication and RLS; the review page is read-only.
- Original source-import and historical reporting data are retained for audit, not copied to a customer-facing catalog.

## New general retail test products

Five editable **private** fixtures are seeded to the same existing supplier store and identified by unique `DEMO-*` SKUs:

| SKU | Product | Price | Initial stock |
| --- | --- | ---: | ---: |
| DEMO-TEE-001 | Demo Cotton T-Shirt | $24.99 | 0 |
| DEMO-CAP-001 | Demo Baseball Cap | $17.99 | 0 |
| DEMO-TOTE-001 | Demo Canvas Tote | $21.99 | 0 |
| DEMO-BOTTLE-001 | Demo Water Bottle | $14.99 | 0 |
| DEMO-STICKERS-001 | Demo Sticker Pack | $6.99 | 0 |

These are imaginary software test fixtures, not merchandise for sale. They are inserted with `is_published=false`, in private sample categories, without images or approval authorizations. The supplier can add an image/reuse an image, modify names, description, price, category, stock and private availability using existing owner/manager controls. New supplier products default to an unarchived private draft.

## Release and payment boundaries

- **Do not turn on BTCPay live or Prism merchant payouts as part of this migration.**
- **Do not change the existing public release gate, product/supplier authorizations, RLS grants or checkout locks.**
- All five seeded products remain private and out of stock. A real public release still needs policy review and tested checkout, stock reservation and payout reconciliation.
- The already-built buyer-to-supplier fictional checkout demonstration remains separate and read-only/local. Its sample products are not these database records.

## Migration rollout and validation

1. Validate current store ID, IDs and unpublished count (63). Preserve existing schema and test evidence.
2. Run full Apex CI and disposable database isolation suite on the feature branch.
3. Apply the schema/data migration to the identified Supabase project using a reviewed migration action, before merging code that queries `archived_at`.
4. Verify archive count exactly 63, five unarchived demo records with starting stock 0, unchanged product ID references, unchanged public gate and no published rows.
5. Merge the code update only when all checks pass; verify Vercel production deployment, signed-in supplier list and signed-out private route protections.
6. Reconcile potential concurrent supplier creations before migration: manifest must never accidentally archive any new product.

If an issue occurs, **do not delete the archive**. Use a reviewed restoration migration or revert the code to show all products; preserve audit trail.

## Roadmap to a transferable commerce platform

**Next phase: general-product supplier release controls.** Replace routine admin preapproval with supplier-controlled publishing for eligible, ordinary retail categories, while retaining admin takedown and prohibited-product rules. Public appearance, stock/quantity tracking, cart admission, payment eligibility and merchant go-live must remain independent and auditable. Out-of-stock listings should remain visible with Sold Out labels.

**Backend rehearsal phase.** Deliver isolated, persisted, two-session buyer/supplier ordering with simulated payments, shipping and reporting before turning on BTCPay/Prism. Validate stale cart prices, duplicate webhooks, authorization, payout splitting, taxes/shipping rules, returns and concurrency.

**Transfer readiness.** Make brand identity, domain, platform commission and merchant accounts configurable. Create tenant onboarding, provider configuration and key-rotation, RLS/access audits, backup/restore and environment templates, licenses/IP inventory, documentation and acceptance tests for the acquiring operator.

A software test catalog does not by itself waive legal obligations for any later physical goods; future merchants remain responsible for permitted listings and transaction compliance.
