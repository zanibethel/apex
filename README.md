# Apex — founding-supplier marketplace

**Status (November 5, 2026):** The branded application is deployed to Vercel production, and code through [PR #248](https://github.com/zanibethel/apex/pull/248) is merged. **No live checkout, Bitcoin settlement or supplier fulfillment is authorized.** The latest verified state, open PR backlog, and November 5–8 execution plan are in [the current checkpoint](docs/APEX_WEEKEND_CLOSEOUT_2026-11-05.md). Historical launch plans below are retained as references.

## Product at a glance
- Working brand: **Apex Anabolics** (brand rights and domain **not yet confirmed**).
- First release: **one founding supplier, one branded storefront, one domain** reserved for that supplier under a written arrangement.
- Technical foundation: Next.js on Vercel, Supabase for data/auth, separate BTCPay Server + Prism deployment for *proposed* Bitcoin payments, GitHub for version control, Proton business email/VPN, optional Resend for transactional mail.
- Target: **six weeks to a technically reviewable MVP** after funding, complete supplier inputs, and agreed scope. Live commercial launch is a separate gated decision.
- Proposed commercial mechanism: Bitcoin invoice with configurable **90% supplier / 10% platform** allocation, subject to tested payout forwarding, wallet-security review, written terms and required approvals.

## Planning library
| Document | Purpose |
|---|---|
| [Product vision](docs/PRODUCT_VISION.md) | Users, first-launch features, exclusions, future expansion |
| [Partner UX and design brief](docs/UX_AND_DESIGN_BRIEF.md) | Anonymized partner feedback; premium mobile storefront design criteria |
| [Six-week roadmap](docs/ROADMAP.md) | Weekly goals, acceptance checks, critical dependencies |
| [December 1 accelerated plan](docs/DECEMBER_1_ACCELERATED_PLAN.md) | Optional 3–4-hour/day sprint to earlier technical acceptance |
| [Six-week execution contract](docs/EXECUTION_PLAN_6_WEEKS.md) | Daily tasks, weekly exit gates, scope discipline and work cadence |
| [Weekly check-in template](docs/WEEKLY_CHECKIN_TEMPLATE.md) | Repeatable progress and acceptance evidence |
| [Critical-path risk register](docs/CRITICAL_PATH_RISKS.md) | BTC payout, funding, security, launch dependencies |
| [December launch and seasonal promotions](docs/DECEMBER_LAUNCH_AND_PROMOTIONS.md) | Partner's pre-Dec 10 target and narrow 24-hour sale candidate |
| [Current November 5–8 checkpoint](docs/APEX_WEEKEND_CLOSEOUT_2026-11-05.md) | Verified deployment/database state, unmerged PR triage, remaining blockers and end-of-week plan |
| [Project status](docs/PROJECT_STATUS.md) | Historical context with pointer to current verified state |
| [Architecture](docs/ARCHITECTURE.md) | Services, boundaries, data flow and hosting |
| [Bitcoin payments](docs/PAYMENTS_AND_LEDGER.md) | 90/10 target, reconciliation, refunds, failure handling |
| [Security and release gates](docs/SECURITY_AND_RELEASE_GATES.md) | Requirements for shipping and live payments |
| [Brand and domains](docs/BRAND_AND_DOMAINS.md) | Working identity, colors, candidate domains |
| [Operations and costs](docs/OPERATIONS_AND_COSTS.md) | Software/service allowance and hosting operations |
| [Partner inputs](docs/PARTNER_INPUTS.md) | Supplier information and approvals needed |
| [Decisions](docs/DECISIONS.md) | Agreed direction vs open decisions |
| [Development playbook](docs/IMPLEMENTATION_PLAYBOOK.md) | Small, testable, reviewable changes |
| [Data model draft](docs/DATA_MODEL_DRAFT.md) | Suggested tables and data integrity rules |

## Privacy
**This GitHub repository is public.** Do not commit private partner proposals, signed contracts, customer or supplier PII, credentials, wallet recovery material, private keys, API keys, or actual wallet addresses. Keep sensitive negotiated terms in a private approved system. This repository may document proposed technical economics; it does not constitute a signed agreement.

## Implementation status — current

- [#243–#248](https://github.com/zanibethel/apex/pull/248) are merged; exact production build on `main` was READY at commit `75598b6d2955b16bf5bd0d05dd2900d0093e13da` on November 5.
- Supabase is healthy; **63** products, **0** published, **0** sales, **0** held orders, **0** on-hand inventory and the private release gate **disabled** at the verified snapshot.
- Read-only supplier held-order views and metadata CSV are available; no order-ingestion worker, actionable shipment report, label purchase, tracking mutation or live BTC transfer.
- There were **63 open PRs** at the checkpoint, including obsolete/stacked draft branches and [#242](https://github.com/zanibethel/apex/pull/242), which must not be bulk merged.
- Current next actions, security advisor triage and technical acceptance criteria: [November 5–8 checkpoint](docs/APEX_WEEKEND_CLOSEOUT_2026-11-05.md).

```sh
npm install
npm run dev
npm run check
```
