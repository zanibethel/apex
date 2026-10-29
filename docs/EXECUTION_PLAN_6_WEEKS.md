# Apex — six-week execution contract

**Version:** 2026-10-29 | **Owner:** developer/operator | **Partners:** founding supplier reviewers | **Status:** plan for execution, no funding or production provisioning verified.

## The commitment
- **Technical MVP target:** six weeks from the **actual funded-and-ready kickoff**, working about **1–2 focused hours each day (7–14 hours/week; 42–84 hours total)**.
- **Stretch calendar goal:** technical readiness and founding-partner review by **December 7–9, 2026**, *only if* the funded-and-ready kickoff begins on/around October 29 and required decisions/materials arrive quickly. Six weeks after Oct 29 is Dec 10. A later kickoff moves dates unless scope is explicitly reduced.
- **Commercial activation** is a separate, documented go/no-go. Never describe the six-week target as guaranteed approval for real-money Bitcoin or regulated-product sales.
- **No paid production infrastructure before approval.** Free/local/mock work can start while partners review funding.
- **One founding supplier, one domain, one shop** for the MVP; the underlying schema uses supplier/store IDs for later expansion.
- **Proposed BTC economics:** 90% supplier / 10% platform on agreed eligible revenue. BTCPay+Prism must be tested; forwarding may be delayed. Network transaction fees and platform commissions are separate concepts. Do not preprogram a fixed BTC miner fee as guaranteed.
- **Core feature set:** branded responsive product browsing, supplier authentication/inventory, mock cart/order fulfillment, reporting, transactional notifications, test BTC invoice/split/reconciliation, security and backups. The **one-rule 24-hour flash sale** is optional and gated by capacity.
- Exclusions: live regulated-product checkout without authorization; multi-supplier onboarding, advanced promotions, AI finder, Lightning, altcoins, mobile app, vendor payouts and custom custody software.

## Weekly process — non-negotiable
1. **Start of each day (10 min):** read this plan, [status](PROJECT_STATUS.md), open issues and any unmerged PR. Confirm today's *one* deliverable and blockers.
2. **Build (40–90 min):** implement only the next small change on a feature branch; use mock/anonymized data until approved.
3. **Finish (10–20 min):** run available tests, update issue checklist and status, commit/push, open/update PR with test evidence. Never imply untested code is done.
4. **Day 7 weekly review (1–2 h):** demo a working artifact, verify gate, log known defects/risks and obtain a recorded partner decision when needed. Carry unfinished work forward openly, not by quietly cutting testing.
5. **PR policy:** one reviewable scope per PR; do not merge with failing lint/typecheck/tests, exposed secrets or critical access-control bugs. No production deploys without explicit review.
6. **Change control:** optional requests are recorded separately and either displace a named optional task or go to backlog. Do not add features silently during the six weeks.
7. **Blocking rule:** if stuck >30 minutes, log the error, experiments and a next action; switch to another task that does not bypass the dependency. The next day's first task addresses or escalates it.
8. **No false completion:** "Done" requires a link to an artifact/test or reviewed PR, not just a code suggestion.

## Day-by-day plan (D1–D7 = work sessions, not necessarily calendar weekdays)

### Week 0 — Ready-to-start gate (before the funded clock)
- [ ] Confirm funding receipt / account payer **privately**; identify domain and hosting account owner.
- [ ] Review and merge planning PR #1 after confirming public-repo visibility.
- [ ] Obtain initial supplier catalog/sample media and business policy owner; keep private details off public GitHub.
- [ ] Confirm signed or explicitly approved scope and partner decision turnaround.
- [ ] Commission basis, network fee treatment, ownership/termination, refund allocation and legal/payment reviewer assigned.
- [ ] Record kickoff date in project status when ALL prerequisites are met.
**Exit:** kickoff authorized. If not, remain in Week 0 and do free planning/prototype work, not billable provisioning.

### Week 1 — Foundation and payment feasibility discovery
- **D1:** Kickoff checklist, domain/account approvals and prioritized acceptance scope.
- **D2:** Next.js + TypeScript shell, local development scripts and minimal project structure.
- **D3:** GitHub CI (lint, typecheck and test runner), environment placeholders and safe staging configuration.
- **D4:** Apex brand tokens, mobile layout shell and anonymized sample products.
- **D5:** Supabase data/auth/RLS migration outline; tenant isolation test plan; no actual supplier secrets.
- **D6:** **Early BTCPay/Prism feasibility review**: plugin version, forwarding model, Bitcoin signing/custody, on-chain network fee handling and test network setup; record risks and an alternate path if needed.
- **D7:** Run checks, review small PRs, demo responsive home/catalog shell; update risks and obtain Week 1 acceptance.
**Exit gate:** reproducible dev environment + CI; staging shell or documented staging blocker; explicit payment-spike decision and reviewer/approver list.

### Week 2 — Premium storefront, supplier access and early split proof
- **D1:** Mobile header/navigation, category cards and responsive catalog layout.
- **D2:** Search/filter/product detail and clean empty/loading/error states.
- **D3:** Supabase Auth roles + private supplier administration skeleton; enforce RLS and server authorization.
- **D4:** Minimal supplier product/stock CRUD with mock data; tenant isolation tests.
- **D5:** Mobile QA and partner walk-through: a first-time user can find a sample product without instruction.
- **D6:** Run a **scoped Bitcoin testnet/regtest feasibility spike** for receiving an invoice and configuring split forwarding/signing, if test infrastructure is ready; document exactly what was and was not demonstrated.
- **D7:** Demo storefront and role restriction; reach **payment architecture gate**: either evidence-supported route to two-wallet payout verification, or an explicit blocker/alternative to evaluate before Week 4.
**Exit gate:** navigable supplier storefront, protected supplier actions, documented BTC split architecture viability/risks. **Do not claim the 90/10 split is proven unless on-chain test evidence exists.**

### Week 3 — Orders, stock and reporting (without real commerce)
- **D1:** Server-authoritative cart totals, price snapshots, quote expiry/discount basis design.
- **D2:** Mock order creation and order history; signed-in customer/supplier access.
- **D3:** Supplier order acceptance/fulfillment status and audited inventory movements.
- **D4:** Immutable transaction/commission model and daily, weekly, monthly reporting; separate owed/paid amounts.
- **D5:** Proton correspondence and optional Resend transactional delivery plan; safe email templates and events.
- **D6:** Tests for totals, double submits, permissions and inventory consistency.
- **D7:** Demo full **mock** purchase from catalog through fulfillment and reports; partner approval of critical flow.
**Exit gate:** mock order/report totals reconcile, no cross-supplier access and scope remains frozen. Decide **yes/defer** on simple sale rule, based on time remaining and critical-path health.

### Week 4 — Bitcoin-only test checkout and split reconciliation
- **D1:** Isolated BTCPay/Prism test environment with documented version/configuration, limited signing privileges and admin access.
- **D2:** BTC invoice creation, quote/expiry, correlation to internal order.
- **D3:** Authenticated, replay-safe webhook handling and blockchain confirmation policy.
- **D4:** Execute a controlled **90/10 test payout** and capture both destination transfers, or record the exact failure/blocker.
- **D5:** Verify received/owed/submitted/confirmed payout states, rounding and fee deductions; ledger reconciliation.
- **D6:** Test underpay, overpay, expiration, duplicate callbacks, delayed/rejected payouts and no-duplicate commission.
- **D7:** Payment demonstration + explicit go/no-go for continuing with Prism. **If two-destination payouts are not reliably verified, do not portray 90/10 as working; document alternate architecture and re-scope the demo.**
**Exit gate:** reproducible payment test evidence and identified signing/custody constraints. No live funds.

### Week 5 — Safety, refunds, resilience and optional promotion
- **D1:** Denial tests for roles/RLS, auth/session, request input validation and rate controls.
- **D2:** End-to-end financial idempotency, commission/refund adjustment and payout reconciliation tests.
- **D3:** Supplier-funded refund accounting model and explicit platform-error exceptions; mock refund flow.
- **D4:** Monitoring, alerts, backups, tested restore and restricted server admin access.
- **D5:** Mobile/accessibility/performance QA and partner UX refinements (highest impact only).
- **D6:** **Only if core Week 4 gate is green and all critical tests pass:** one admin-scheduled 24-hour percentage-off rule with timezone-safe expiry; otherwise document deferment.
- **D7:** Security and recovery review; no unresolved critical exposure; stabilize the release candidate.
**Exit gate:** critical security and reconciliation tests green; restore demonstrated; optional promotion does not block MVP.

### Week 6 — Final acceptance and release decision
- **D1:** Supplier content and policy review; verify final demo-safe catalog, wording and required disclosures.
- **D2:** Full buyer → order → supplier → BTC **test** invoice → two payout records → reporting path.
- **D3:** Backup restore, rollback and operational incident/halt-switch rehearsal.
- **D4:** Partner UAT on mobile/desktop: product discovery, mock checkout, inventory, reporting, refunds.
- **D5:** Fix only acceptance-blocking defects; rerun regression and inspect deployment configuration.
- **D6:** Publish release notes, support/runbook, unresolved issues and final technical/live gate matrix.
- **D7:** Signed-off **technical MVP demo**; separate written live-commerce go/no-go. No silent activation.
**Exit gate:** partner accepts technical demo, tests and runbooks; live checkout stays disabled until business/product/payment approvals and security gates are independently met.

## Weekly scorecard (populate at each Day 7 review)
| Field | Required evidence |
|---|---|
| Planned milestone | One outcome and owner |
| Completed? | Yes / partial / blocked, with PR/preview/test links |
| Quality | Lint, typecheck, automated/manual tests and defects |
| Schedule | Hours spent, remaining work and impact on six-week target |
| External blockers | Funding, content, domain, merchant/product/payment approval |
| Scope decisions | Feature accepted, traded or deferred with reason |
| Next week | Top three outcomes and partner decisions due |

Use [weekly check-in template](WEEKLY_CHECKIN_TEMPLATE.md) for a copyable review entry.

## Hard change / launch gates
- **W0:** funded and scoped; owners and supplier input path known.
- **W1:** dev/CI reproducible + Bitcoin viability discovery started.
- **W2:** supplier-facing UX tested + credible payment integration path or identified blocker.
- **W3:** coherent mock commerce and reporting, partner demo.
- **W4:** actual test-network two-destination evidence or explicit architectural stop.
- **W5:** security/refunds/backup tests green.
- **W6:** documented technical acceptance and distinct regulatory/payment activation decision.

If any gate fails: record a blocker, defer optional scope, and communicate revised readiness; never silently claim success or take live funds to meet a date.
