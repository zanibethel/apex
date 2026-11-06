# Apex — November 6, 2026 execution checkpoint and cross-chat handoff

**Repository:** [zanibethel/apex](https://github.com/zanibethel/apex)  
**Production:** https://apexanabolics.co  
**Database:** Apex Supabase project `fhqpkpztercadcxspdkg`  
**Last confirmed `main` SHA before this documentation-only PR:** `c182b977bbe2bbc441b7f3a46ad68ab1a7c2198a` (merged PR #300).  
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

**Done/read-only foundation:** one Orders & Fulfillment hub; same-supplier held-order headers; exact order drilldown with immutable original identity; bounded original line snapshot drilldown; browser-only partial-quantity preview; daily historical sales reports; original-order-ID cumulative CSV and duplicate/stale conflict **preview**; review-only shipment status model; account-scoped USPS readiness; Resend report/email provider-delivery evidence plumbing.

**Not complete:** independently authorized **paid/eligible** operational fulfillment queue; protected delivery-record use; durable audited shipment/line allocation ledger, distinct states and revision checks; partial shipments; supplier-scoped carrier/tracking entry; idempotent replay/stale conflict protections backed by database constraints; safe spreadsheet CSV update reconciliation; USPS label purchase/approval and verified tracking; genuine supplier email delivery/attachment confirmation; live refund and payout/order reconciliation. A recorded `confirmed` historical sale is **not** proof of processor settlement. See [Issues #215–#219](https://github.com/zanibethel/apex/issues/215) and [Track 3 acceptance plan](APEX_TRACK3_ACCEPTANCE_TEST_PLAN_2026-11-05.md).

## Next bounded development slice — separate chat

**Recommended next PR:** **Audited, versioned private shipment and partial-allocation *foundation*** for eligible future orders, anchored to immutable existing order/line IDs. Avoid another independent order catalog or shipping dashboard.

1. Inspect current `main`, Issues #215–#219, #214, the deployed `order_detail_snapshots`, `order_line_snapshots`, existing review-only fulfillment state model, CSV preview, protected delivery contracts and supplier auth patterns. Respect any concurrently changed branches.
2. Define `shipment_id`, immutable parent `order_id`/`line_id`, supplier `store_id`, version, state, actor and audit event identity; database uniqueness for duplicate/replay protection; strict expected-version conflict rejection; maximum allocations never exceed originally purchased quantities, including partial shipments and cancellations. **Do not fabricate eligible source orders**.
3. Put **legal/product/supplier/shipping/payment eligibility** in a separate independently validated authority boundary. The existing held/unverified source must **never** become eligible through a UI switch, a recorded sale state, a supplier note, a CSV upload or caller-provided `approved` flag.
4. Implement a tested read-only shipment/plan preview or fail-closed draft infrastructure first. Do **not** allow operational dispatch, address decryption, label purchase, carrier API calls or state `shipped` until a reviewed eligible-order authorization contract actually exists.
5. Add durable audit and versioned transition tests, including hostile cross-tenant, anonymous/staff, duplicate ID, replay, stale two-session update, partial allocation overflow, invalid state transition and rollback cases. Prefer transactionally checked, private DB invariants over only UI checks.
6. Add minimal, simple supplier UI to the existing Orders & Fulfillment / original-order detail when safe. No new redundant screens, and no assumption that test data represent real orders.
7. Create `feat/apex-supplier-shipment-ledger-foundation`, small coherent PRs, exact-head lint/types/Node, isolated Postgres RLS/concurrency tests, build and Vercel preview. **Never deploy/merge with failing checks**, and verify exact production SHA after an authorized merge.
8. Update this checkpoint, Track 3 acceptance plan and Issue #215 with what has actually passed, what remains blocked and the smallest follow-up. Keep public product release, checkout and USPS/postage execution disabled.

**Separate-chat prompt (tracked copy):** [Track 3 next-chat prompt](supplier/NEXT_TRACK3_SHIPMENT_LEDGER_PROMPT_20261106.md).

## Supplier/manual smoke for currently merged work

- Sign in to https://apexanabolics.co/supplier and choose **Products**. Edit a saved product, verify image/pencil placement and quantity-tracking setting; never claim it becomes public merely because Publish intent is on.
- Open https://apexanabolics.co/supplier/orders and use Daily reports / Download-compare CSV / USPS setup navigation.
- With a real verified immutable *held* order, select **View original record**. Confirm original ID/reference/date/line count and purchase-time lines display; trial a partial-quantity **preview**. No saving or shipping should occur.
- **Currently zero real held orders** in the latest verified hosted snapshot; therefore do not claim a populated order UI was tested against real purchases. Review-only CI uses synthetic, disposable order fixtures.
- Verify a signed-out session and a different supplier cannot access another store's original order records or lines.
- Use https://apexanabolics.co/admin/fulfillment-qa for a separate **synthetic sample** run, not a live transaction.

## Important release constraints and operational ownership

Suppliers will manage routine product choices, inventory, shipping choices and fulfillment **once independently eligible**. The platform provides the software, records, payments/reconciliation and reporting infrastructure. Apex is still a marketplace/platform participant; a supplier checkbox or agreement does not automatically establish the permissions required for controlled/prescription substances or legal shipment. Keep admin compliance holds, authorization verification and separate payment gates. Routine approved catalog edits should not require unnecessary repeat approvals.

**End of checkpoint.**
