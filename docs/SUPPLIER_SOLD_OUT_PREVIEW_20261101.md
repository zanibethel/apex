# Apex supplier imported products — private sold-out gallery
Date: 2026-11-01

## Existing Apex Supabase state at inspection
Project `fhqpkpztercadcxspdkg`:
- 63 imported source variants from supplier cost sheet, 62 `unverified` and one `approved_for_draft`.
- Only one imported variant has been promoted into a saved product. That private product has a reusable image; the 62 remaining rows **have no product rows or actual inventory records**.
- The saved product had initial stock on hand of 5 and price 1599 cents, compare 2500, source cost not copied. The approved import cost is 840 cents. This document does not claim inventory changes if they were not separately verified.
- Private store is not public and no products are flagged publicly published.

## Proposed pricing
Treat source/import `wholesale_cost_cents` as supplier source cost, never as a customer-facing price. Pricing proposal uses exact integer cents:
- `sell_cents = 2 * source_cost_cents`
- `compare_at_cents = ceil(2.5 * source_cost_cents)` (round half cents up)
- simulated gallery stock = **0 / SOLD OUT**, checkout is disabled.

For example, $8.40 cost -> $16.80 proposed selling, $21.00 proposed compare-at reference, zero shown. This comparison reference is NOT verified as a historical price, so **do not market it as a discount or use a percentage-off banner** without evidence.

## Implementation
- Restricted `/supplier/imports/sold-out-preview` page accessible only to a verified signed-in owner/manager of a single private store, with no `anon` reads.
- Reads existing imported variants from tenant-scoped `supplier_import_candidates` with complete count verification, cost and review status. No unverified record is auto-approved.
- Uses only one existing private product image, **signed for 120 seconds within the authorized supplier session**, repeated on each preview card; no public object URL, copied image, storage write or new image charge.
- Displays products in responsive tiles with proposed selling and compare-at reference prices. Internal costs remain restricted to supplier page. Every tile explicitly says SOLD OUT, shows zero preview units, and has a disabled action.
- Adds source-variant gallery link in the supplier import review page. Saves **no new product rows** or fake actual stock; existing product inventory must be independently reconciled to zero by an authorized inventory edit.

## Public launch limitations
These are **not** customer-facing live listings because 62 imported source rows remain unverified, there are no actual product drafts/verified images for those 62, public release gate is off, and published catalog RLS does not make them visible. Never bypass the release engine or create live purchase buttons to satisfy a visual preview.

A later narrowly reviewed staging pass can promote verified variants into private drafts with source-cost/price proposal, assign SKUs and verified image copies, and initialize actual inventory rows to zero. After compliance/publishing approval, create a separate read-only sold-out public catalog projection that cannot create orders or invoices. A proposed compare-at price can be stored for back-office review, but not advertised as a former price without substantiation.

## Test/verification gate
- Exact-head GitHub lint, typecheck, Node tests and build.
- Vercel preview READY; merge only if green.
- Production may host the authorized private preview without enabling any public products, orders or Bitcoin.
