# Apex — November 5 cross-chat continuation and supplier variant handoff

**Recorded:** 2026-11-05 (America/Chicago). **Repository:** `zanibethel/apex`. **Purpose:** preserve the latest three-track development and supplier catalog decisions so another work chat can resume without relying on old October planning text.

**Verification boundary:** This handoff distinguishes merged GitHub code, prior database snapshots, agreed requirements, and unimplemented/live-blocked workflows. It is documentation only: no database write, supplier inventory change, payment, publishing, label purchase, release-gate change or deployment is authorized by this file.

## Verified repository checkpoint

- `main` observed at `d3996878372ac524d34c9ba9c88d9411d903078f` when the handoff branch was created.
- Merged **#279** (isolated fulfillment/CSV/email review contracts), **#280** (admin-only interactive CSV QA), **#281** (privileged private media copy/revocation/public-delivery adapter behind OFF gates), **#282** (simplified product-card image Add / Change / Reuse), and **#283** (one-click three-track synthetic sample purchase).
- Also merged **#278** (bounded, read-only payment-history review), earlier **#251 / #259 / #265** (checkout handoff and protected order foundations), and **#266 / #269 / #275** (mail delivery journal, health and owner alert code).
- GitHub merge is **not** by itself a verification of the exact deployed production SHA or a signoff for commerce; verify hosting and hosted migrations separately.
- Previous November 5 *hosted-data* snapshot in [weekend checkpoint](APEX_WEEKEND_CLOSEOUT_2026-11-05.md): 63 products saved, 50 active, 13 uncategorized, 0 publicly published, 0 on-hand/reserved, 0 source sales, 0 held-order snapshots; private commerce gate OFF. **Those figures were not re-queried during this documentation handoff** and should be refreshed before intake or a launch decision.

## Development tracks: current handoff

| Track | Merged foundation | Still missing / must not be called live |
| --- | --- | --- |
| **1 — Customer storefront and catalog** | Mobile browsing, product detail, cart refresh, optional shipping, protected checkout handoff and simplified image upload/replace/reuse. Private reviewed-image infrastructure has separate hard-OFF public release gates. | Supplier workbook mapping, first-class product option/variant data and exact cart/order persistence, confirmation of eligible public listings and actual stock. No automatic publication. |
| **2 — Orders, BTCPay/Prism and payout accounting** | Server-side validation and immutable *held* identity/secure delivery foundations, sampled/read-only payment audit/history, regtest evidence; #283 exercises shared contracts with synthetic records. | Authoritative production order writer with independent settled-payment evidence, reservation/reconciliation, provider-scoped Greenfield credentials, invoice lifecycle, production payout authorization/recovery. Live checkout and transfers remain blocked. |
| **3 — Fulfillment, reporting, USPS and mail** | Read-only held-order browser/export (#243–#248), isolated status/partial-allocation/CSV conflict modules (#279), private CSV QA workbench (#280), delivery tracking/alerts code (#266/#269/#275). | A paid/eligible-order-sourced operational queue, authorized shipment transitions/tracking, atomic workbook reimport, shipping-ready protected report, USPS merchant permission/tested labels and verified genuine supplier email delivery. No actual shipments or postage. |

**Admin synthetic test:** `/admin/fulfillment-qa` → **Run sample purchase**, then use the Day 3/Day 4/stale/valid CSV QA. This runs an in-memory two-item scenario, does not create hosted orders or charge Bitcoin, and must never be treated as payment settlement or a shipped order. See [Track 3 acceptance plan](APEX_TRACK3_ACCEPTANCE_TEST_PLAN_2026-11-05.md).

## Latest supplier workbook and product-options decision (not yet imported)

The recent supplier handoff referenced **`MC_LIST__UPDATED_.xlsx`** and screenshots of product options. The workbook itself is **not present in this public repository** and was **not available for parsing in this handoff**. Do not populate product rows or infer exact prices from screenshots or older source-cost files.

Agreed mapping for the supplier-provided workbook:

1. Workbook listed money amounts are **customer-facing retail prices**, **not wholesale/source cost**. Do not double them, apply the earlier source-cost x2 retail rule, or fill `source_cost` with these retail prices.
2. The customer sees **one parent product listing** for a product with selectable **Carrier oil** (examples: MCT and GSO), **Strength** (mg), and **Size** (mL) when those options actually exist in the authorized workbook.
3. Each valid option combination is a **distinct saleable variant** with its own stable supplier-scoped identity/SKU, exact retail price, inventory/availability, and any applicable identifiers; do not invent combinations absent from the workbook.
4. Preserve exact chosen variant **through the product detail, cart, authoritative checkout handoff, immutable order line and supplier fulfillment report**. A parent-only product ID is insufficient where variant price/stock differs.
5. Reconcile against the existing saved catalog before writing. Preview **existing unchanged / proposed edit / new listing or variant / duplicate or ambiguity / missing information**; keep supplier ownership, variant identity and prior manual media/text edits stable. Repeat import must be idempotent.
6. Supplier-reported availability is not proof of **on-hand stock**. Until quantities are evidenced, preserve 0 available / sold-out behavior; do not flip publishing, stock, release gate or shipping permissions from the workbook.
7. Keep raw supplier prices, workbook cells and other supplier-only materials in an authorized **private** channel or storage, never committed to this public repo.

**Current state of this decision:** design requirements recorded; no workbook rows processed, no variant implementation verified, no stock/pricing/catalog migration or publish action made by this handoff. Track the intake under [Issue #213](https://github.com/zanibethel/apex/issues/213).

## Supplier experience preference

Use the already merged #282 **Add image / Change image / Reuse existing image** flow directly on the product card, retaining existing same-supplier reuse and optional bulk image application. Keep pencil-to-edit product details, clear single/bulk publish toggles and admin hold/override behavior simple. Do not reintroduce unnecessary image approval steps into ordinary draft editing; separately authorized public media delivery still uses release gates.

## Next reviewable work (dependency order)

1. **Supplier catalog intake:** obtain the actual private workbook, normalize column semantics, compare with the 63 existing saved products and preserve explicit retail/variant values. Draft a read-only mapping and duplicate/conflict report under #213 before any authorized write.
2. **Variant-aware catalog and checkout:** add/verify a supplier-scoped parent/variant contract and tests for MCT/GSO, strength, size, independent SKU/price/stock, selected variant through cart/Track 2 handoff and order snapshots. Avoid inventing prices or combinations.
3. **Track 2 source of truth:** independently verify order admission, settlement and protected delivery release before moving held orders into shipment eligibility. Continue test/production credential separation and readback/recovery.
4. **Track 3 operational closure:** add only audited eligible fulfillment state, protected tracking, conflict-safe workbook import and secure reports. USPS supplier account/Labels API approval and approved test environment remain external prerequisites.
5. **Observability and release:** check exact merged SHA in Vercel, automated CI/RLS, genuine signed Resend events, Supabase security findings, issue owners and blockers. Maintain distinct test/live payment states and explicit preproduction merge gates.

**Unmerged PR discipline:** [#242](https://github.com/zanibethel/apex/pull/242) remains an older umbrella PR; do not merge it wholesale. Stacked legacy regtest/payment PRs must be compared with later merged implementations before closure or extraction.

## Suggested starting test for the next chat

1. Sign in as verified platform admin and open `https://apexanabolics.co/admin/fulfillment-qa`.
2. Click **Run sample purchase**. Confirm six synthetic stages show no actual BTC payment, inventory write, delivery-record exposure or shipment.
3. Download Day 3/Day 4/stale/valid CSV fixtures and run repeat/duplicate/stale browser-only comparison.
4. Open supplier bulk catalog and verify image **Add / Change / Reuse**, saved products, optional CSV export and preview. **Do not upload unreviewed workbook into a public issue or turn on stock/publishing**.
5. Record exact PR/CI/preview/prod SHAs and supplier intake blockers on [#213](https://github.com/zanibethel/apex/issues/213).

**Target:** December 1, 2026 technical readiness, not automatic live commercial activation.
