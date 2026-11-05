# Apex — November 5, 2026 recent-chat development handoff

**Source:** November 5 conversations, connected GitHub PR metadata and Vercel production deployment readback. This is a coordination checkpoint, not authorization to release products, orders, Bitcoin payments or USPS postage.

## Verified repository and hosting status

- GitHub repository: `zanibethel/apex`; default branch: `main`.
- Latest verified merged PR: [#283](https://github.com/zanibethel/apex/pull/283), **merged November 5, 2026**. Production Vercel deployment `dpl_DKTVkAuVb2DiJEnZLpwZ3PcrYqs6` was reported **READY** with commit `d3996878372ac524d34c9ba9c88d9411d903078f`, associated with #283, for the `apex` project (not a claim of a completed real checkout).
- Commercial release remains **unapproved**. No evidence in this handoff supports enabling real checkout, BTCPay invoices, split payouts, label purchases, shipment writes or customer notifications. The release gate was OFF in the last recorded database readback; its present value was **not freshly queried** for this document.
- Prior database baseline from [Nov 5–8 closeout](APEX_WEEKEND_CLOSEOUT_2026-11-05.md): 63 saved products, 0 published, zero on-hand stock, zero sales or held orders. These figures are historical snapshots **not reverified during this handoff**.

## November 5 merged work since the earlier #248 checkpoint

| Merged PR | Practical capability | Boundary |
| --- | --- | --- |
| [#278](https://github.com/zanibethel/apex/pull/278) | Bounded, admin-only read-only payment-history review and test runbook | No settlement or payout authorization |
| [#279](https://github.com/zanibethel/apex/pull/279) | Isolated partial-fulfillment/revision vocabulary, cumulative review CSV parser and private-email attachment manifest | Synthetic/review only, no order or carrier writes |
| [#280](https://github.com/zanibethel/apex/pull/280) | Protected `/admin/fulfillment-qa`: repeatable Day 3 + Day 4 CSV test, stale-edit and duplicate comparison, conflict download | Browser-memory only; not an operational supplier shipment queue |
| [#281](https://github.com/zanibethel/apex/pull/281) | Private reviewed-image copy, digest verification, revocation and gated delivery implementation | Public image serving still requires verified rights/approval and separate disabled release gates |
| [#282](https://github.com/zanibethel/apex/pull/282) | Product-card **Add image / Change image / Reuse existing image**; same-store image reuse in standard and bulk editors | Supplier draft editing is simple; preserve admin release holds |
| [#283](https://github.com/zanibethel/apex/pull/283) | Platform-admin **Run sample purchase** button at `/admin/fulfillment-qa`: synthetic cart → validated checkout handoff → held-order readback → signed mock webhook → held partial allocation → metadata-only report | Uses no real customer/order/payment/shipping records; never authorizes fulfillment |

Earlier Track 1/2 handoff/catalog/stock/price contracts and Track 3 held-order export work are already recorded in existing checkpoint documents. Do not redo those implementations or merge the old umbrella [#242](https://github.com/zanibethel/apex/pull/242) without a deliberate remaining-diff review.

## Supplier product input from latest conversations — awaiting reconciliation

- A source workbook named `MC_LIST__UPDATED_.xlsx` was uploaded in an Apex work chat on November 5. **This handoff did not inspect or authorize its row-level content**; do not infer that catalog counts or real inventory changed.
- Most recent product-option direction: group variants visibly by **carrier oil (MCT/GSO, where actually applicable), strength, and volume**, while keeping each variant's own supplier identity, SKU, price and availability all the way through the eventual cart and order snapshot.
- Product-option price shown in the source conversation is intended as the **retail price**, not necessarily the source cost. Do not overwrite saved cost/sell/compare-at prices until each column's meaning has been verified against the original workbook and supplier-approved pricing.
- Follow [Issue #213](https://github.com/zanibethel/apex/issues/213) and [the private supplier-intake checklist](SUPPLIER_INTAKE_2026-11-04.md): reconcile the new file with the 63 prior saved items; classify unchanged, modified, new variant, duplicate and unclear rows; protect prior manual edits; review category/media rights; keep unverified on-hand stock at zero.
- The workbook and supplier-specific source details must remain outside this public GitHub repository.

## User experience decisions to preserve

1. Supplier product cards stay compact. A single pencil/edit control manages title, price, description, SKU, inventory and image. Publish/unpublish should stay simple, including multi-select bulk actions.
2. Supplier draft editing and image reuse do **not** require extra manual approval steps; platform admin may impose a documented hold, block release and review resubmissions.
3. Customer-facing layouts should look like final production UI, not carry misleading simulated-payment marketing copy. The separate private admin QA page may plainly identify synthetic tests.
4. Shipping fees remain optional/configurable with promotions and free-shipping thresholds; do not add sales-tax collection to the checkout workflow.
5. Payment test/live environments stay separate. Admin-adjustable supplier/platform split settings remain subject to provider verification and independent authorization; no automatic live activation.
6. December 1, 2026 remains a **technical-readiness target**, not an approved commercial launch or guaranteed carrier-authorization date.

## Immediate operator test / acceptance sequence

1. Sign in as verified platform admin at [Fulfillment QA](https://apexanabolics.co/admin/fulfillment-qa). Run the one-click sample purchase. Expect six stages to pass, and **no** order, inventory, payment, label or shipment write. See [Track 3 plan](APEX_TRACK3_ACCEPTANCE_TEST_PLAN_2026-11-05.md).
2. In the supplier catalog on mobile, add, change and reuse a same-store image on a draft product. Verify its card refreshes without requiring unrelated approvals, while a separately held product remains held.
3. At the same admin QA workbench, exercise Day 3/Day 4 20+20 CSV examples, stale/duplicate edits, conflict CSV download and repeated import; check no hosted write occurs.
4. Use admin payment-monitor read-only history to review bounds and reference mismatches; never infer that a record proves independent Bitcoin settlement.
5. Verify the supplier workbook privately and create the **review-only** catalog/variant mapping before any saved-product, pricing or stock write. Record owner review and pass/fail evidence on Issue #213.
6. For Issues [#214](https://github.com/zanibethel/apex/issues/214)–[#219](https://github.com/zanibethel/apex/issues/219), keep the independently attested paid-order source, protected delivery, real fulfillment CSV, Resend receipts and USPS Labels API approval as separate gates.
7. Recheck GitHub exact-head CI, Vercel production SHA, Supabase readback and product/public release gates before changing any production behavior.

**Scope of this document:** statuses, source decisions and explicit unknowns only. No public catalog import, Supabase migration, new checkout endpoint, production deployment, invoice or shipment authorization is performed by this documentation update.
