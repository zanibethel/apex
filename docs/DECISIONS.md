# Decision record

Use `DECIDED FOR BUILD`, `PROPOSED`, `VERIFIED`, or `APPROVED FOR LIVE`. Only a test/approval can upgrade the last two states.

| ID | Topic | Status | Direction and note |
|---|---|---|---|
| ADR-001 | Supplier scope | DECIDED FOR BUILD | One founding supplier, one domain at launch; supplier/store IDs permit later expansion. |
| ADR-002 | Brand | PROPOSED | Apex Anabolics; deep black, metallic silver and crimson; name/domain not cleared. |
| ADR-003 | Web/data stack | DECIDED FOR BUILD | Next.js + Vercel + Supabase; separate Bitcoin VPS. |
| ADR-004 | Checkout asset | DECIDED FOR BUILD | Bitcoin-only initial test flow; no Lightning/altcoins in MVP. |
| ADR-005 | Splitting mechanism | PROPOSED | BTCPay + Prism, 90/10 target. Must prove on-chain forwarding, signing/custody, costs and authorization. |
| ADR-006 | Refund responsibility | PROPOSED | Supplier funds ordinary order refunds, with platform-error and legal exceptions in contract. |
| ADR-007 | Reporting | DECIDED FOR BUILD | Daily/weekly/monthly, auditable sales, separate incoming receipt and each payout, refund adjustments. |
| ADR-008 | Email | DECIDED FOR BUILD | Proton Workspace for business mail/VPN; Resend only if needed for transactional delivery. |
| ADR-009 | Admin server access | DECIDED FOR BUILD | Public HTTPS checkout, private WireGuard/restricted privileged maintenance. |
| ADR-010 | Timeline | PROPOSED | Six weeks after funding and complete inputs to a technically reviewable MVP, not unconditional live go-live. |
| ADR-011 | Funding/compensation | PROPOSED | Founding supplier funds infrastructure; developer takes agreed transaction share in lieu of separate upfront development labor. Terms require contract. |
| ADR-012 | Repository privacy | VERIFIED | Repo was public on 2026-10-29. Never publish partner contracts, wallet keys, account secrets or identity data. |
| ADR-013 | December target | PROPOSED | Partner prefers technical readiness **before Dec 10, 2026** for possible holiday launch. Dec 7–9 stretch assumes immediate funding/inputs; live sales remain gated. |
| ADR-014 | Holiday promotions | PROPOSED | Simple 24-hour, scheduled, single-rule sale is a priority candidate only if it fits the scoped six-week plan. New Year's campaign may follow approval. |

## Important unresolved design questions
1. Can Prism payout signing be configured without undue custody/security risk?
2. Does the selected Bitcoin flow require money-transmitter registration/licensing in relevant jurisdictions?
3. What does merchant/product authorization permit for the exact launch catalog?
4. What is the agreed calculation base/rounding/network-fee payer and refund allocation?
5. Who legally owns the brand, registered domain and hosting/payment accounts?
6. Which merchant and customer markets are in scope?
7. Which event/signer design gives auditable payout reconciliation with minimum privilege?

Changes to these decisions should be made in small PRs with test evidence or partner signoff, not silently.
