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


## November 1 follow-up — 47 name-specific default descriptions

`src/lib/catalog/import-default-descriptions.mjs` now contains 47 individually authored, neutral compound/ingredient summaries, covering all 63 imported name/strength variants. This is **editable suggested draft copy**, not prevalidated product labeling, claims approval, pharmaceutical identity or a substitute for supplier batch documentation.

- `/supplier/imports/sold-out-preview` shows the defaults under each card's collapsible **Default product description**, to keep 63 mobile cards compact.
- On `/supplier/imports`, promoting a separately reviewed source variant prefills the **editable** draft description field; an authenticated supplier may edit, trim or replace the suggestion before saving. The existing supplier product editor supports subsequent price and description edits and the inventory editor supports stock changes.
- The one previously approved/saved product's temporary test text was replaced in the hosted Apex database with its neutral default. The remaining 62 remain `unverified` source candidates and have no saved `products` or `inventory_items` rows. **Nothing was automatically approved, promoted or made public.**
- Source labels `FOX-04`, `SLU-PP-322`, `GLOW`, `KLOW`, `T2` and `T3` require extra identity or strength confirmation. Do not silently equate similar identifiers (for example `SLU-PP-322` and `SLU-PP-332`).
- Updating on-hand stock is **not** public listing approval. Future customer availability requires (1) complete and independently validated identity/authorization, (2) approved store/category/product release, (3) trusted stock and price rechecks and (4) separately enabled ordering/payment infrastructure. Under present settings no imported product is orderable regardless of inventory.
- A proposed compare-at reference derived only from a markup formula is **not proof of a previously charged price**; do not display strike-through or percentage savings based solely on that formula.

### Research/reference anchors for neutral summaries

- U.S. FDA, significant safety concerns and knowledge gaps for selected peptides (including BPC-157, AOD-9604, CJC-1295, LL-37, ipamorelin, GHK-Cu): https://www.fda.gov/drugs/human-drug-compounding/certain-bulk-drug-substances-use-compounding-may-present-significant-safety-risks
- U.S. FDA, 2024 Pharmacy Compounding Advisory Committee peptide chemistry: https://www.fda.gov/media/183641/download
- PubChem, 5-Amino-1-methylquinolinium: https://pubchem.ncbi.nlm.nih.gov/compound/5-Amino-1-methylquinolinium
- U.S. DailyMed, EGRIFTA SV (tesamorelin) specific authorized prescription formulation: https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=3d783378-b02d-4f19-99dd-0fc91a042224
- Tocris/Bio-Techne identifies `SLU-PP-332` as a separate named research material: https://www.bio-techne.com/p/small-molecules-peptides/slu-pp-332_8112
- Further primary documentation is required before stating batch-specific form, concentration, purity, efficacy, or use directions.

The summaries intentionally do **not** assert route, dose, purity, packaging form, therapeutic claims, FDA authorization, or that the imported supplier variant is molecularly identical to a named published compound. Do not promote these drafts into customer marketing or public commerce without independent product-specific review.
