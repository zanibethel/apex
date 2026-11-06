# Supplier option reconciliation — review-only contract v1

**Status:** versioned pure Node module and tests, no route, database migration, live catalog edit, inventory change, public image release, cart update or commercial authorization. Reference: [Issue #286](https://github.com/zanibethel/apex/issues/286).

The supplier's original November 5 price workbook is private and **must not** be checked into GitHub. Retail amounts are the customer's displayed **retail** prices, **not source cost** and **not** an input to the earlier source-cost ×2/2.5 policy. The user's review workbook remains the authorized manual staging artifact.

## Input

`buildSupplierVariantReviewV1({schemaVersion:1,storeId,rows,existingVariants})`, where `storeId` is a supplier/store UUID. Each pre-resolved `rows[]` entry must contain exactly these fields:

- `sourceRow` (1-based original Excel row, integer >= 2)
- `parentTitle` (supplier-reviewed parent product title)
- `strength` (one **resolved** option or empty string)
- `size` (one **resolved** option or empty string)
- `carrierOil` (`MCT`, `GSO`, or empty for no carrier choice)
- `retailPrice` (one decimal USD retail-price string, optional leading `$`, never a cost)
- `sku` (verified existing SKU, or empty; never auto-create a live SKU)
- `requiresClarification` (boolean; true always holds the row)

`existingVariants[]` is an independently fetched **private, supplier-scoped** snapshot using the exact keys `id,storeId,parentTitle,strength,size,carrierOil,retailPriceCents,sku`. Do not substitute user-supplied browser data for the existing database snapshot; future server wiring must enforce per-store access and an atomic stale-version check.

The caller **must first resolve** multi-option cells into separately priced combinations. For example, `MCT/GSO` is an instruction to offer separate options, never one carrier value. The normalizer does not guess price pairings, silently Cartesian-expand, or double retail amounts. If a price association or source identity is uncertain, pass `requiresClarification:true`; do not create an assumption.

## Output and review states

The function produces a deterministic review with `rows[]`, `blockers[]`, `duplicatesSuppressed`, `inputCount` and `hasUnresolvedIssues`. Rows are classified as `proposed_new`, `existing_unchanged`, or `proposed_edit`. Each normalized variant has a stable store-scoped option identity independent of its price. Repeated identical source variants are suppressed; conflicting prices or SKU identities are blocked rather than overwritten. A cross-store existing snapshot fails the entire call.

Every review result expressly sets `canApplyChanges:false`, `canPublish:false`, `canPlaceOrder:false`, `canAdjustStock:false`, `sourceCostCents:null` and `verifiedOnHand:null`. These are **not** product availability or business approval verdicts.

## How to verify

```bash
node --test tests/supplier-variant-review-v1.test.mjs
npm run check
```

Use only synthetic fixtures in committed tests. Before a future product-card dropdown or import/write PR, reconcile source identities against the previously saved 63-item catalog and validate supplier ownership, stock proof, real SKU lineage, allowed combinations, category/media gates, and selected-option preservation through the canonical cart → order line → supplier report. Use a separate reviewed schema/checkout contract. Do not mark a held order fulfilled or create real payment/postage from this module.
