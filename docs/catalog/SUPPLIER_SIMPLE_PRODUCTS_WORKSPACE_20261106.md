# Supplier Products — simplified daily workflow
Updated: 2026-11-06. PR #293.

## Supplier navigation

**Supplier dashboard → Products** opens `/supplier/catalog/bulk`, now the primary searchable product editor. The previous `/supplier/catalog` is retained under **Legacy product manager** for backward compatibility but its long source-review panels are collapsed.

## Saved products (currently 63 separate saved records)

- Search by title or SKU; filter the list by relevant status.
- Each compact row shows a signed private image thumbnail (or placeholder), title, display price, category, stock summary and Publish switch.
- Tap the **pencil** to edit product title, SKU, retail price, optional compare-at, category, description, private source cost where available, image **Add / Change / Reuse**, and on-hand inventory.
- **Save changes** for a single row or select multiple and **Save selected**. Images and stock remain governed by their existing authorization, release-status and concurrency checks.
- The Publish switch is the same existing supplier preference, **not** a direct database/public release bypass; admin holds and separately verified public-release requirements remain unchanged.
- Large storefront preview tiles are hidden by default, but **Show previews** can reveal them.
- Bulk category cleanup, legacy source import, shared-image mass apply, and CSV import/export remain available under expandable optional tool sections.

## Supplier intake (76 proposed groups, 168 reviewed options)

- Within the same Products workspace, expand **Supplier intake**. This displays all source-batch proposals grouped into one searchable product card per parent, with an in-card variant dropdown and exact **retail** prices.
- Each card links to its own supplier content review/approval via **Review options**. Long blend formulas remain visible as **Composition** text.
- 157 staged options have reviewable prices. Eleven options across five source rows are held for clarification. No price, SKU or quantity is inferred.
- **The 76 proposed parent groups are NOT yet mapped to authoritative product IDs among the 63 saved products.** Do not claim they are editable saved products, merge based on approximate name, or bulk-create duplicates until a reviewed one-to-one mapping is complete.
- Source review decisions are content approvals only; they do not publish products or activate sales.

## Verification checklist

1. Sign in with an assigned supplier owner/manager. Tap **Products** from the dashboard and confirm compact saved cards load without oversized previews.
2. Search by name and SKU; edit one saved product and preview a private change without inadvertently saving or publishing anything else.
3. Confirm Add / Change / Reuse image options and the existing audited stock editor still work without changing unrelated products.
4. Expand **Supplier intake**, search one of the 76 parent names, change a price-bearing variant dropdown and follow **Review options** to the corresponding held/approvable detail card.
5. Verify staff and cross-store accounts cannot access unauthorized supplier content. Verify a request to publish a held product remains blocked by the existing server-side checks.
6. Verify existing products (63), inventory records (63), variant staging (168), content approvals, and release gate are unchanged by deploying this purely presentational PR.
7. Pass exact-head GitHub Node/lint/typecheck/build, isolated RLS, Vercel preview; merge only on successful checks. No automatic payment or stock release.

## Remaining work

The next integration step is a controlled reconciliation of the 76 source parents to existing saved product IDs (5 exact normalized name overlaps out of 76 are only candidates, not approved matches), and a versioned authoritative variant-storage/editor model. Until that is completed, supplier intake can be reviewed but cannot be edited as ordinary saved products. Keep this distinction clear.
