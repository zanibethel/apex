# Apex — founding-supplier marketplace

**Status: planning / partner review; no live checkout.** This repository is the source of truth for the planned application and its technical decisions. As of 2026-10-29 the repository contains planning documentation only.

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
| [Six-week execution contract](docs/EXECUTION_PLAN_6_WEEKS.md) | Daily tasks, weekly exit gates, scope discipline and work cadence |
| [Weekly check-in template](docs/WEEKLY_CHECKIN_TEMPLATE.md) | Repeatable progress and acceptance evidence |
| [Critical-path risk register](docs/CRITICAL_PATH_RISKS.md) | BTC payout, funding, security, launch dependencies |
| [December launch and seasonal promotions](docs/DECEMBER_LAUNCH_AND_PROMOTIONS.md) | Partner's pre-Dec 10 target and narrow 24-hour sale candidate |
| [Project status](docs/PROJECT_STATUS.md) | What exists, what is only proposed, and next action |
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

## Implementation status
No production service is provisioned or authorized by these documents. Code and configuration will be added through separate reviewed PRs. Do not infer that a design decision, price estimate, approval, wallet, or domain has been finalized merely because it is documented here.
