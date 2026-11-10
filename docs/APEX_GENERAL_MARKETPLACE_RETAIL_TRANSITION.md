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


## Supplier-chat CSV operations

A supplier owner or manager can ask CoOperative-branded chat for "CSV template" or "upload CSV". The template is the same existing nine-column Products CSV, available as a direct file download.

The chat accepts files with up to 100 rows (256 KB). It validates the CSV headers, each SKU, price, known category and row duplication, then gives a **read-only preview** of new and skipped records. Only clicking **Confirm import** triggers any changes. Imports run in bounded chunks of 20 through the existing server-authorized supplier draft action. Saved products begin with zero stock and are private, never automatically released or sent to BTCPay.

Repeating an identical CSV skips existing matching SKUs. A conflicting SKU or nonblank existing product ID must be resolved through the full Products CSV editor, which is linked inside the chat. This simplified assistant flow creates new supplier products and intentionally does not overwrite saved records.

**Publishing status:** The existing supplier chatbot can request and withdraw publication intent using the audited RPC after a second confirmation. Public release is still separately gated; chat must never say "live" when only the preference has been recorded. The supplier-controlled release of eligible general-retail products, with administrator takedown and checkout controls, remains Issue #319.

Manual acceptance: sign out (no supplier tools), sign in as supplier owner/manager, request the template, upload a small CSV, confirm the preview, check two saved drafts, retry and check SKUs skipped, verify cross-supplier access blocked, and confirm the public catalog/BTCPay are unchanged.


## Supplier chat: direct confirmed price and quantity edits

The code-first supplier chat now recognizes precise commands such as "set price of Demo Cotton T-Shirt to $29.99", "set stock of DEMO-TEE-001 to 10" and "mark Demo Cotton T-Shirt out of stock". It selects exactly one saved product in the verified owner/manager's current private store, prepares an explicit **old → new** preview, and requires a separate **Confirm request** click. Without confirmation, nothing is written.

The server requires fresh Supabase authentication and store membership, same-origin request, a current private unarchived product and optimistic-concurrency comparisons against the preview values. Price edits preserve the product's compare-at-price constraint and update only price_cents. Stock edits compare the current on-hand count before writing through the existing audited inventory table; newly reserved stock cannot be invalidated by a concurrent update. Results revalidate supplier views and return the actual saved change.

No client input controls the store ID. Editing never publishes a product, creates BTCPay invoices, changes payment settings or touches archived products. If multiple products match, the assistant asks for an exact name/SKU. "Mark in stock" without a number asks for a quantity instead of fabricating inventory. For now combined requests are explicitly decomposed into separate confirmations (price, stock, then any publishing request), rather than attempting non-atomic multi-table changes.

**Remaining:** full direct conversational descriptions/images, bulk stock changes, and actual supplier-controlled public release of eligible retail products are separate tested phases; see Issue #319. The original publish/unpublish command continues to save supplier intent only.
