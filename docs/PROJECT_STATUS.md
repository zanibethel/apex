# Project status — 2026-10-29

## Current position
- Partner proposal sent; project owner reports **$150 initial build funding secured October 29, 2026**. Receipt, account owner and supplier authorization are not independently verified.
- New GitHub repository: `zanibethel/apex`.
- Repo at discovery: only `README.md` with a short title. The first Next.js demo shell now exists on a **separate proposed implementation branch**; no reviewed production deployment or live transactions.
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

Developer proposed increasing to **3–4 focused hours per day** and aiming for **December 1, 2026 technical readiness**. See [accelerated sprint plan](DECEMBER_1_ACCELERATED_PLAN.md). This is a stretch goal, conditional on approximately October 30 funded-and-ready kickoff; the $150 has been reported secured, but supplier inputs and production approval remain unconfirmed. Existing six-week timeline remains the contingency, not additional feature scope. Live commercial activation continues to require independent approval.

## Delivery discipline

- Follow [six-week execution contract](EXECUTION_PLAN_6_WEEKS.md), with **7 daily 1–2h sessions per week**, short PRs, Day 7 demo/acceptance and explicit stop/deferral rules.
- [Weekly progress template](WEEKLY_CHECKIN_TEMPLATE.md) and [critical-path risks](CRITICAL_PATH_RISKS.md) are the standard tracking tools.
- **$150 in initial funding has been reported secured, but not independently verified. No spending occurs in this PR.** The six-week clock starts after actual funding, scope agreement and supplier inputs, not simply when partners express willingness to fund.
- BTCPay/Prism architecture research moves into Week 1 and viability gate into Week 2; do not wait until Week 4.

## Next actions while supplier and implementation reviews are pending
1. Merge documentation PR after checking public-repository privacy.
2. Establish Next.js/TypeScript baseline with minimal lint/test/CI (separate PR).
3. Implement brand tokens and static mobile catalog **using non-sensitive sample products** (separate PR).
4. Draft Supabase schema and RLS tests before integrating real supplier content (separate PR).
5. Build a test-only BTCPay/Prism spike; verify wallet-signing and payout mechanics before promises or real money.
6. Maintain an explicit open-issues list for partner inputs, domain choice, legal/product authorization and payment-routing review.

## Decision status convention
`PROPOSED` = preferred but not verified; `DECIDED FOR BUILD` = technical planning choice; `VERIFIED` = proven by test; `APPROVED FOR LIVE` = formally cleared and released. Do not collapse these states.

## Initial implementation pass (October 29)

- First code branch: Next.js/TypeScript shell, branded mobile-first concept pages, demo-only catalog placeholder, source-level tests and GitHub CI. These are authored for review; [GitHub Actions initial verification passed](https://github.com/zanibethel/apex/actions/runs/40968759178) (lint, typecheck, tests and build), but the code is **not merged or deployed**.
- Funding ledger and exact sprint scope: [Sprint 01](SPRINT_01_KICKOFF.md).
- No catalog inventory, checkout or payment code is activated.

## Connected infrastructure update (October 29)

- Vercel `apex` is Git-linked to this repository, built Next.js 22 successfully from the unmerged application branch and reports READY. **The initial deployment was assigned a production target**, so Vercel Authentication was enabled for **all** Apex deployments; it is not public or commercially active.
- The dedicated Supabase **Apex** project now exists under `zanibethel's Org` in `us-east-1`, ref `fhqpkpztercadcxspdkg`, verified `ACTIVE_HEALTHY`; **0 public tables, 0 migrations**. The user approved Supabase's **$10/month** recurring project quote. No migration applied, per explicit user instruction. The isolated SQL schema remains review-only in PR #14.
- Provider IDs, review chain, protection and next gates are in [infrastructure registry](INFRASTRUCTURE_STATUS.md).
