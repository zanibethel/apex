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
- Six-week technical readiness target with a narrow first release.
- Developer compensated via ongoing proposed sales share rather than separate upfront labor invoice; partner terms not finalized here.

## Next actions while partner review is pending
1. Merge documentation PR after checking public-repository privacy.
2. Establish Next.js/TypeScript baseline with minimal lint/test/CI (separate PR).
3. Implement brand tokens and static mobile catalog **using non-sensitive sample products** (separate PR).
4. Draft Supabase schema and RLS tests before integrating real supplier content (separate PR).
5. Build a test-only BTCPay/Prism spike; verify wallet-signing and payout mechanics before promises or real money.
6. Maintain an explicit open-issues list for partner inputs, domain choice, legal/product authorization and payment-routing review.

## Decision status convention
`PROPOSED` = preferred but not verified; `DECIDED FOR BUILD` = technical planning choice; `VERIFIED` = proven by test; `APPROVED FOR LIVE` = formally cleared and released. Do not collapse these states.
