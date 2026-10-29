# Six-week technical MVP roadmap

**Detailed daily schedule and non-negotiable exit gates:** [Six-week execution contract](EXECUTION_PLAN_6_WEEKS.md). Weekly reviews use [the check-in template](WEEKLY_CHECKIN_TEMPLATE.md) and [risk register](CRITICAL_PATH_RISKS.md).

**Critical sequencing change:** BTCPay + Prism feasibility investigation begins in **Week 1**, with an explicit technical viability checkpoint in **Week 2**; Week 4 remains the full two-destination test. Do **not** wait until Week 4 to discover a blocker.

**Trigger:** Week 1 begins only after funding, a scope freeze and usable supplier materials. **Capacity assumption:** ~1–2 developer hours/day, about **42–84 total hours over six weeks**. This is an aggressive, scoped target for technical readiness, not a guarantee of legally cleared live checkout.

| Week | Work | Review checkpoint |
|---|---|---|
| **1 — Foundations** | Confirm scope; choose architecture; receive supplier product/catalog materials; settle brand/domain path; create project skeleton, Vercel/Supabase staging and issue/PR workflow. Start processor/Prism signer-feasibility and product-approval review immediately. | Repo CI and staging skeleton; supplier inputs checklist |
| **2 — Storefront** | Mobile-first layout, brand tokens, listing/detail views, catalog content, basic inventory editing, supplier authentication/RLS and BTC splitting feasibility spike. | Clickable private supplier storefront and documented split viability/risks |
| **3 — Order operations** | Cart, order and inventory records, supplier fulfillment queue, transaction-neutral order states, email notifications and daily/weekly report queries. | End-to-end **mock** order, correct dashboard counts |
| **4 — Bitcoin test flow** | Isolated BTCPay/Prism test server; invoice integration; confirmation webhooks; **90/10 test payout** attempt and actual-destination reconciliation; underpayment/expiry tests. | Evidence-backed Bitcoin test ledger and payout result; unresolved split limitations documented |
| **5 — Hardening** | Security checks, role/tenant isolation, audit trail, refund accounting, replay/idempotency, backups, restore rehearsal, server administration controls and monitoring. | Critical paths tested; documented blockers |
| **6 — Technical acceptance** | Fix critical findings; supplier walk-through; documentation; staging smoke test; rollback/recovery exercise; launch-readiness decision. | MVP signoff for technical scope, **not automatic authorization for live sales** |

## December date alignment (partner preference)

The founding partner wants the site ready **before December 10, 2026** to consider holiday promotions. Six weeks from October 29 lands on December 10; if funding and complete inputs are available on October 29, aim for **December 7–9** as the stretch technical-readiness review. If funding starts later, recalculate the six-week schedule instead of implying the original date is guaranteed. A commercial launch requires separate explicit approval; see [December launch plan](DECEMBER_LAUNCH_AND_PROMOTIONS.md).

A single 24-hour scheduled percentage-off sale is a **conditional small feature request**. Reassess after the Week 3 core order/reporting checkpoint, and do not trade away privacy, correct payment accounting, security or mandatory release gates to meet a promotion date.

## Partner visual and usability checkpoints

- **Week 2:** Show mobile and desktop branded storefront against [UX and design brief](UX_AND_DESIGN_BRIEF.md): legible catalog cards, search, simple navigation and clear product detail.
- **Week 5:** Verify mobile responsiveness, keyboard access, contrast, clear mock checkout and actionable loading/error states.
- **Week 6:** Include partner visual review and observed find-a-product/complete-a-mock-order walkthrough. Record feedback as actionable issues, not open-ended aesthetic redesign.

## Conditions to maintain six-week target
- One founding supplier, one storefront/domain and the fixed MVP scope above.
- Supplier materials (approved product list, media, descriptions, policies) arrive promptly.
- Weekly, bounded review windows and rapid partner decisions.
- Use familiar Next.js/Supabase patterns and tested third-party components; do not invent payment custody infrastructure.
- Treat approvals requiring third parties as parallel dependencies, not promises under developer control.

## Technical definition of done
- CI checks passing and no blocking security findings.
- Supplier cannot see another supplier's records; operator scope is explicit.
- Orders and payments are separate state machines with idempotent transitions.
- No order counted as financially settled based only on an untrusted browser redirect.
- Per-payout transaction identifiers reconcile to actual destination, amount and confirmation.
- Reconciliation exceptions, late/failed payouts and refunds appear in operator reports.
- Backups restored successfully in a rehearsal; operational runbook exists.

## Live-commerce gate
A six-week technically ready site can remain in demo/test mode. Do not enable commercial order placement or real crypto transfers until product/supplier authorization, approved payment arrangement, security controls, operational ownership and any applicable financial-services review are complete. If an external approval slips, demo readiness stays the milestone and live activation waits.
