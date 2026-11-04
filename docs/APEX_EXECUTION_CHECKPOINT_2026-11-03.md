# Apex — execution checkpoint and next-stage roadmap
**Snapshot:** November 3, 2026 (America/Chicago) · **Owner:** Apex operator / development · **Status:** verified technical checkpoint, NOT commercial authorization.

This document supersedes stale status statements in the original October 29 `PROJECT_STATUS.md` and supplements `ROADMAP.md`. Detailed tasks live in the GitHub issues below. Keep one small, reviewable PR per work package, verify on the exact head, then request a deliberate merge/deploy review.

## Current verified state — checked against connected Apex on November 3
| Capability | Verified state / evidence | Immediate implication |
|---|---|---|
| Website | Vercel production READY; Apex connected to `zanibethel/apex` | Existing site live; latest reviewed changes merged |
| Saved product catalog | **63 saved**; **50 active**; **13 uncategorized**; **0 supplier-published** | Complete category/content review; do not infer active = public/approved |
| Source/staging | **63 staged supplier import candidates** | Compare future list to existing source IDs/variants before creating drafts |
| Inventory | **63 inventory rows, 0 on hand, 0 reserved** | Possible larger supplier availability is NOT on-hand stock |
| Verified orders | **0 sales**; no populated customer delivery + line-item fulfillment model | Reports cannot invent orders/addresses or generate genuine shipping attachments |
| Reports | PR [#210](https://github.com/zanibethel/apex/pull/210): private daily Central-date sales snapshots; 10:00 UTC snapshot job active | Summaries cover verified recorded sales, not fulfillment automatically |
| Email | PR [#211](https://github.com/zanibethel/apex/pull/211): Resend domain verified, Proton remains inbox provider; **1 opted-in recipient; 1 sender fingerprint** | Respect opt-in, monitor provider delivery; template design test delivered |
| CSV reconciliation | PR [#212](https://github.com/zanibethel/apex/pull/212): verified-sales review CSV, duplicate + stale row guard, audit | *Reviewed* is not *shipped*; no tracking/fulfillment writes |
| USPS | PR [#210](https://github.com/zanibethel/apex/pull/210): supplier-paid account **readiness page**, no live merchant connection | No real label purchase or automatic tracking yet |
| Commercial gate | **OFF** and **0 sales** at snapshot | No live checkout, payment transfer, or restricted-product shipment activation |
| Prior supplier UI | PR [#209](https://github.com/zanibethel/apex/pull/209): mobile product-first workspace, bulk CSV and image tools | Reuse existing controls; avoid rebuilding them |

**Caveat:** Figures above are a point-in-time snapshot. Query the database before each supplier intake, public visibility decision or launch checkpoint.

## Priority & dependencies — GitHub is source of truth

| Priority | Requirement | Issue | Readiness / dependency |
|---|---|---|---|
| **P0 — next day** | Potential additional supply: private intake, existing-vs-new diff, duplicate protection, evidence and supplier review | [#213](https://github.com/zanibethel/apex/issues/213) | Existing CSV and staging import tools. No inventory writes based only on stated availability |
| **P1** | Canonical order IDs, immutable purchase time, customer address and order line items with strict privacy | [#214](https://github.com/zanibethel/apex/issues/214) | Only verified/eligible order source; synthetic fixtures first |
| **P2** | Supplier-scoped queue, partial-fulfillment state machine, tracking ledger and revision audit | [#215](https://github.com/zanibethel/apex/issues/215) | P1. No postage transactions |
| **P3** | Cumulative fulfillment spreadsheet export and import, conflict preview, duplicates/version handling | [#216](https://github.com/zanibethel/apex/issues/216) | P1+P2. PR212 is sales-review only, not shipment tracking |
| **P4** | Secure daily pending-order attachment/link before 8 AM Central | [#217](https://github.com/zanibethel/apex/issues/217) | P1–P3, plus verified recipient and data minimization |
| **P5** | Supplier-funded USPS merchant authorization, eligible label quote/purchase, tracking updates | [#218](https://github.com/zanibethel/apex/issues/218) | P1+P2, carrier permissions and eligibility |
| **P6 — parallel** | Resend delivery/bounce monitoring, mail UI polish, cron health | [#219](https://github.com/zanibethel/apex/issues/219) | Existing PR210–211; independent of real fulfillment |
| **P7 — release review** | Security, backup, payout test evidence, role checks, regulatory and operator approval | [#220](https://github.com/zanibethel/apex/issues/220) | All required technical acceptance, plus existing [#11](https://github.com/zanibethel/apex/issues/11) Bitcoin feasibility |

## Dated review plan (best-effort checkpoints; rebaseline on blockers)
- **Wed Nov 4 — P0 partner intake.** Receive *possible* expanded supply information through a private channel; generate a review-only difference list and classify legal/stock verification gaps. If nothing arrives, record "awaiting supplier" rather than zero or confirmed inventory.
- **Thu–Fri Nov 5–6 — P0 close + P1 design.** Supplier reviews duplicates, source identities, category and media gaps. Draft private order model (one source of truth, no live checkout). No automatic product activation.
- **Nov 7–10 — P1 small schema/test PR.** Define immutable order event identity, line items and confidential delivery fields; run cross-supplier/RLS/idempotency tests. If upstream authorized data is absent, use synthetic records and mark integration blocked.
- **Nov 11–14 — P2 review-only fulfillment ledger.** Status rules, tracking-number validation and partial order audit using test fixtures.
- **Nov 15–18 — P3 cumulative upload/export.** Explicit acceptance for Day 3 = 20; Day 4 = +20; edited and unuploaded workbook; exactly 40 unique order IDs, no duplicate shipments or stale overwrites.
- **Nov 19–22 — P4 report attachment / secure link and P6 mail polish.** Timezone-safe daily snapshots; private authorization; alerts and delivery status; review iPhone email appearance.
- **Nov 23–26 — P5 supplier USPS authorization and test-only label workflow review.** Requires external USPS approvals and product shipping eligibility. If delayed, record blocker, do not replace a real label with fake tracking.
- **Nov 27–Dec 1 — P7 stabilization and partner technical acceptance.** Scope freeze for optional features, verification of integrations, recoverability, RLS, email and detailed blocker list. **Dec 1 is a stretch technical demo goal, not live-commerce approval.**

These dates are priority checkpoints, not promises that third-party permissions, legitimate supplier availability, or regulated-product eligibility will be obtained.

## Daily working contract
1. **Review**: most recent production commit, open PRs, issue P0 first, CI and the commercial gate.
2. **Pick one small PR**: implementation and acceptance criteria from issue; no unrelated UX/payment changes.
3. **Verify**: lint, typecheck, Node tests, disposable PostgreSQL RLS, production build, preview. Preserve zero-purchase/zero-shipment gates.
4. **Decide**: operator says "OK go"/"Continue" for the next task; merge only after checks and review.
5. **Record**: PR link, deployed commit/URL, what is actually working, remaining blockers and next owner's action.

## Reporting and product availability rules
- **Sales record** ≠ **verified order line items** ≠ **fulfillable shipment**.
- **Supplier says available** ≠ **physically held/verified inventory**; keep on-hand zero unless an authorized independent stock receipt is recorded.
- **Reviewed CSV row** ≠ **shipped**. Only a trusted shipment/label event can update fulfillment.
- Cumulative reports must keep one permanent (store, order ID), first purchase time, order-line and shipment IDs, state revision and audit history.
- Public listing, live checkout, Bitcoin processing and postage charging are distinct gates requiring explicit approval. Never infer lawful shipping from "research use" marketing or a product's catalog presence.

## Immediate next action
**[#213](https://github.com/zanibethel/apex/issues/213): November 4 supply handoff.** Use [supplier intake checklist](SUPPLIER_INTAKE_2026-11-04.md), compare against the existing 63-product catalog, then make only a reviewable, tested catalog-diff PR. Do not publish or stock products automatically.
