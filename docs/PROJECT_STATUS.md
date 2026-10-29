# Project status — 2026-10-29

## Current position
- Partner proposal sent; funding/supplier decision **pending**.
- New GitHub repository: `zanibethel/apex`.
- Repo at discovery: only `README.md` with a short title; **no checked-in storefront implementation or production infrastructure**.
- This documentation change captures planning so prior conversation decisions do not become lost implementation assumptions.
- Earlier storefront/mockup discussions and partner proposal files exist outside this repo; **not imported or verified as code**.
- Product and supplier names/identities, actual domain availability, ownership, wallet addresses, account provisioning, signed contract and compliance approvals are **not confirmed**.

## Chosen development direction (subject to verification)
- Founding-supplier-first, one launch domain exclusively for that supplier.
- Proposed working identity: Apex Anabolics; black/silver/crimson.
- Next.js + Vercel; Supabase Auth/Postgres/RLS; separate BTCPay + Prism on VPS.
- Bitcoin-only initial payment *test*, with proposed 90/10 forwarding; direct one-transaction/two-wallet split must **not** be assumed.
- Proton Workspace for business mail/VPN; separate WireGuard or equivalent restricted server administration; Resend optional; GitHub for source control.
- Six-week technical readiness target with a narrow first release. Partner's preferred **pre-Dec 10** demo/announcement window is only feasible if funding and inputs are immediately available; **Dec 7–9** is a stretch technical target, not an approved live sale date.
- Partner requested capacity for 24-hour holiday flash sales, with New Year's as a possible second campaign; a single scheduled discount is an **optional MVP candidate** pending scope tradeoff, not implemented or approved.
- Developer compensated via ongoing proposed sales share rather than separate upfront labor invoice; partner terms not finalized here.

## Proposed accelerated delivery — October 29

Developer proposed increasing to **3–4 focused hours per day** and aiming for **December 1, 2026 technical readiness**. See [accelerated sprint plan](DECEMBER_1_ACCELERATED_PLAN.md). This is a stretch goal, conditional on an approximately October 30 funded/ready kickoff; neither funding receipt nor production approval is confirmed. Existing six-week timeline remains the contingency, not additional feature scope. Live commercial activation continues to require independent approval.

## Delivery discipline

- Follow [six-week execution contract](EXECUTION_PLAN_6_WEEKS.md), with **7 daily 1–2h sessions per week**, short PRs, Day 7 demo/acceptance and explicit stop/deferral rules.
- [Weekly progress template](WEEKLY_CHECKIN_TEMPLATE.md) and [critical-path risks](CRITICAL_PATH_RISKS.md) are the standard tracking tools.
- **Funding is not yet verified** based on received evidence. The six-week clock starts after actual funding, scope agreement and supplier inputs, not simply when partners express willingness to fund.
- BTCPay/Prism architecture research moves into Week 1 and viability gate into Week 2; do not wait until Week 4.

## Next actions while partner review is pending
1. Merge documentation PR after checking public-repository privacy.
2. Establish Next.js/TypeScript baseline with minimal lint/test/CI (separate PR).
3. Implement brand tokens and static mobile catalog **using non-sensitive sample products** (separate PR).
4. Draft Supabase schema and RLS tests before integrating real supplier content (separate PR).
5. Build a test-only BTCPay/Prism spike; verify wallet-signing and payout mechanics before promises or real money.
6. Maintain an explicit open-issues list for partner inputs, domain choice, legal/product authorization and payment-routing review.

## Decision status convention
`PROPOSED` = preferred but not verified; `DECIDED FOR BUILD` = technical planning choice; `VERIFIED` = proven by test; `APPROVED FOR LIVE` = formally cleared and released. Do not collapse these states.
