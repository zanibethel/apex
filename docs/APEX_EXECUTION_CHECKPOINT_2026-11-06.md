# Apex — November 6, 2026 execution checkpoint and cross-chat handoff

**Repository:** [zanibethel/apex](https://github.com/zanibethel/apex)  
**Production:** https://apexanabolics.co  
**Database:** Apex Supabase project `fhqpkpztercadcxspdkg`  
**Baseline `main` SHA for the shipment ledger:** `1fa67d22830a2dd14826255b170488754614ff0a` (merged PR #301).

**Target:** December 1, 2026 *technical readiness*, **not** authorization for public commerce.  
**Status vocabulary:** **Merged and tested**, **private/read-only foundation**, **not integrated**, **blocked for execution**. A green production deployment is not evidence of live checkout, payment settlement, or carrier shipment.

This is the current handoff. Earlier [November 5 cross-chat handoff](APEX_CROSS_CHAT_HANDOFF_2026-11-05.md), [weekend closeout](APEX_WEEKEND_CLOSEOUT_2026-11-05.md) and [Track 3 test plan](APEX_TRACK3_ACCEPTANCE_TEST_PLAN_2026-11-05.md) are historical references, not the latest operational checkpoint. Do not overwrite their dated facts.

## Verified merged work since the November 5 handoff

| PR | What is actually available | Important boundary |
| --- | --- | --- |
| [#293](https://github.com/zanibethel/apex/pull/293) | One mobile-first Supplier Products workspace with grouped private intake and saved-product editing | Proposed imported items are not automatically canonical product variants or public listings |
| [#294](https://github.com/zanibethel/apex/pull/294) | Conservative imported-parent matching, links to saved-product editor, match/no-match/clarification filters | Identified 6 conservatively matched parent groups, 8 candidate saved records and 70 unmatched groups; **no auto-merge** |
| [#295](https://github.com/zanibethel/apex/pull/295) | Mobile product-card text layout fixed to avoid overlapping pencil/Publish controls | Presentation only |
| [#296](https://github.com/zanibethel/apex/pull/296) | Per-saved-product **Track inventory quantities** checkbox backed by private forced-RLS preferences | OFF hides private numeric editor; **not** unlimited stock for customer checkout; inventory counts/reservations preserved |
| [#298](https://github.com/zanibethel/apex/pull/298) | Single **Orders & Fulfillment** hub at `/supplier/orders` with held-order overview, report and USPS links | Read-only; original held records **not shippable** |
| [#299](https://github.com/zanibethel/apex/pull/299) | Order-card **View original record** at `/supplier/orders/[orderId]?store=[storeId]` and supplier-scoped immutable-record RPC | Exposes only original metadata, line count and existence of a sealed destination; no PII, shipping or payment grant |
| [#300](https://github.com/zanibethel/apex/pull/300) | Signed-in supplier-only original **purchased-line** read RPC; original line IDs, SKU/title/option, quantity and purchase-time price/subtotal; local partial-quantity preview | **No persisted allocations**, stock reserve, label, tracking, order authorization or state transition |

All #293–#296 and #298–#300 are **merged**. PR #292 (older alternate Products workspace) was closed as superseded, **not merged**, because it conflicted with newer code. The #298–#300 changes passed exact-PR-head Node/lint/TypeScript, isolated PostgreSQL RLS and Vercel preview checks, with successful main-branch checks and production deployment at the time of their completed releases. **Do not infer that newly written code is deployed unless its own checks and production SHA are verified.**

## Last verified hosted-data and release status — November 6

- **63 saved products, 63 inventory records**; **0 publicly published products**.
- Supplier source review recorded **76 staged parent groups / 168 staged option records**, including **11 held clarification options**. Matching is only a conservative review aid, not canonical item reconciliation.
- Last checked at PR #300: **0 real immutable held order snapshots and 0 line snapshots**. Synthetic CI data is rolled back and does not represent purchases.
- `apex_internal.private_release_gate.enabled = false`: public release remains OFF.
- New line-review RPC `get_supplier_held_order_lines(uuid,uuid)` was installed and read back: anonymous execute denied; authenticated access requires server-side supplier membership; direct `apex_internal.order_line_snapshots` table access denied.
- The read-only order-record RPC `get_supplier_held_order_record(uuid,uuid)` is installed; delivery data remains protected, and no customer address is exposed.
- Supabase security advisor can flag authenticated `SECURITY DEFINER` RPC exposure even when deliberately narrow. Treat it as a review finding: inspect explicit membership/identity checks, constrained inputs, output allowlists and execute grants; never assume its existence alone clears security.
- These figures are a **dated snapshot**, not a guarantee after subsequent supplier input or release. Re-query if making a decision based on counts.

## Track by track: what remains

### Track 1 — supplier catalog and customer storefront

**Done/private foundation:** mobile supplier product cards, saved product editing (name/SKU/description/prices/images), simple supplier listing intent, admin holds, inventory preference, staged intake grouping and conservative matching, previews and CSV import review foundations.

**Not complete:** durable canonical parent + variant identity with supplier-controlled exact SKU/option mapping; duplicate-safe staged-to-saved reconciliation for remaining unmatched groups; all supplier editing choices tied to real customer-facing variant, cart and purchase snapshots; independently authorized public publishing. The current Publish switch is **intent**, not a public-live switch. **Don't track quantities** does not override purchase inventory or release gates. See [Issue #286](https://github.com/zanibethel/apex/issues/286), [Issue #297](https://github.com/zanibethel/apex/issues/297).

### Track 2 — checkout, orders, BTCPay and payouts

**Done/foundation:** immutable held order identities/snapshots and limited protected delivery-envelope foundations, private checkout handoff contracts, isolated regtest and payment-security/replay/payout tests, signed-event and reconciliation-oriented components.

**Not complete:** a real authorized customer order writer and immutable versioned line-detail contract for **eligible** orders; independent trusted payment settlement binding; production supplier-specific BTCPay Greenfield configuration, verified Prism split wallets/payout accounting and rollback/recovery; real cart/variant/price/inventory reservation consistency. **No live invoice, payment, settlement or checkout release is implied by regtest success.** Do not merge the old stacked payment PRs en masse.

### Track 3 — supplier operations, fulfillment, reports, USPS

**Done:** one Orders & Fulfillment hub with same-supplier held-order headers and immutable original records and purchase lines. The shipment-plan foundation adds durable partial allocations, remaining quantities, and audited review and cancellation on the same detail screen for confirmed supplier owners and managers. The private ledger uses stable shipment IDs, store-scoped idempotency keys, and revision checks. The hosted migration and deployment verification are recorded on [Issue #215](https://github.com/zanibethel/apex/issues/215). See the [shipment-plan and tracking contracts](supplier/HELD_SHIPMENT_PLAN_V1.md).

Historical sales reports, original-order-ID cumulative CSVs, spreadsheet conflict previews, USPS account readiness, and Resend delivery evidence retain their existing scopes. Review plans cannot advance to packing, label ready, shipped, or delivered. They are separate from the future eligible order queue, and cancellation releases only review quantities.

**Outstanding:** independently authorized paid/eligible operational fulfillment queue, protected delivery-record use, carrier/tracking entry and reconciliation, atomic eligible CSV updates, authorized USPS labels, and eligible fulfillment email attachments. See [Issues #215–#219](https://github.com/zanibethel/apex/issues/215) and the [Track 3 acceptance plan](APEX_TRACK3_ACCEPTANCE_TEST_PLAN_2026-11-05.md).

## Next bounded development slice

Agree with Track 2 on a read-only eligible-order contract tied to immutable order and line IDs. It needs independently verified settlement, per-line product and transport eligibility, and a reference to the separately authorized delivery record. Test denial for held, revoked, and mismatched evidence with synthetic fixtures before adding an eligible-order queue or any execution controls.

## Supplier/manual smoke for currently merged work

- Sign in to https://apexanabolics.co/supplier and choose **Products**. Edit a saved product, verify image/pencil placement and quantity-tracking setting; never claim it becomes public merely because Publish intent is on.
- Open https://apexanabolics.co/supplier/orders and use Daily reports / Download-compare CSV / USPS setup navigation.
- With an immutable held order, select **View original record**. As a supplier owner or manager, save a partial **review plan**, check the remaining quantity, then cancel with a reason and verify it is restored in the ledger. The order stays held. Staff retain the browser-only preview.
- **Currently zero real held orders** in the latest verified hosted snapshot; therefore do not claim a populated order UI was tested against real purchases. Review-only CI uses synthetic, disposable order fixtures.
- Verify a signed-out session and a different supplier cannot access another store's original order records or lines.
- Use https://apexanabolics.co/admin/fulfillment-qa for a separate **synthetic sample** run, not a live transaction.

## Important release constraints and operational ownership

Suppliers will manage routine product choices, inventory, shipping choices and fulfillment **once independently eligible**. The platform provides the software, records, payments/reconciliation and reporting infrastructure. Apex is still a marketplace/platform participant; a supplier checkbox or agreement does not automatically establish the permissions required for controlled/prescription substances or legal shipment. Keep admin compliance holds, authorization verification and separate payment gates. Routine approved catalog edits should not require unnecessary repeat approvals.

**End of checkpoint.**
