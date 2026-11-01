# Things to Consider — Apex

Review-only external intelligence. Not approved code, wallet, payment, security-policy, or production changes. Keep partner identities, keys, addresses, and private terms out of this public repository.

Last reviewed: 2026-11-01

## 1. Isolate Bitcoin signing and payment authority from web/worker compromise

**Status:** Evaluate / release-gate evidence pending  
**Added:** 2026-10-30  
**Last reviewed:** 2026-11-01

**Finding:** Binance reported an estimated $6.3B exchange theft on Oct 29–30; its *preliminary* investigation suggests a compromised DevOps laptop/service container enabled unauthorized withdrawals, without evidence of leaked private keys. This is a separate exchange incident, **not** evidence that BTCPay Server, Prism or Apex were compromised. Source: https://www.binance.com/en/square/post/10-30-2026-binance-stated-that-the-security-incident-affected-approximately-6-3-billion-with-about-3-billion-frozen-382718598048399 .

**Project intersection:** The proposed BTCPay + Prism 90/10 BTC payout design in `docs/PAYMENTS_AND_LEDGER.md` and existing risks R1/R6 in `docs/CRITICAL_PATH_RISKS.md` already require verified signer ownership, idempotent payouts and no secrets in Git. Today's incident adds concrete external evidence for separating web/admin/agent access from signing authority and independently verifying outgoing destinations and settlement. No live Apex wallet, checkout or signing integration is established.

**Possible solution:** Before any live payment proposal, document threat boundaries for developer laptops, Vercel/Supabase, BTCPay host, Prism payout service, wallet signer, and admin recovery. Test least-privilege credentials, signer isolation, withdrawal limits or manual approval, revocation, recipient allowlists, two-destination testnet reconciliation, incident pause, and restore. Require an independent reviewer and documented release-gate evidence.

**Recommendation:** Keep testnet/mock-only. Read-only threat-model review is appropriate; **do not** add wallet keys, live payout flows, signing permissions or new deployment policy without explicit approval. Existing legal/payment eligibility gates remain in force.

**2026-10-31 evidence:** Binance's Oct 30 official update now says the preliminary compromised-laptop explanation was incomplete: investigators found additional breach points, while the full root cause remains under investigation. Binance reports ~$3B frozen and says withdrawals remain suspended pending checks. This strengthens the existing signer/authorization/revocation threat-model gate; it does not establish any Apex, BTCPay or Prism exposure. Source: https://www.binance.com/en/support/announcement/detail/d3306d9dca5243548c813b605e1d1751 .

**2026-11-01 evidence:** Reuters reports Binance resumed selected BTC/ETH/stablecoin withdrawals in phases after replacing about 95% of stolen tokens; the incident is still under investigation. Wiz's Oct 30 report documents nine AI-developer-platform incidents targeting stored secrets and large-scale provider-key abuse. Neither establishes Apex/BTCPay/Prism compromise. **Possible solution:** read-only inventory of supplier/admin, Vercel/Supabase, CI, BTCPay and wallet signer authority; keep keys out of code, isolate signer and verify revocation. **Recommendation:** preserve no-mainnet release gate. Sources: https://www.reuters.com/legal/government/binance-resumes-bitcoin-withdrawals-after-covering-bulk-stolen-63-billion-2026-11-01/ ; https://www.wiz.io/blog/black-october-for-ai-developer-platforms .

---

## 2. Storefront deployment versus catalog acceptance

**Status:** Evaluate / supplier-data acceptance pending  
**Added:** 2026-10-31  
**Last reviewed:** 2026-11-01

**Evidence:** Vercel's latest READY production deployment is Apex main commit `7c106fcc` (mobile supplier product cards/source-cost editing); the connected Supabase `products` table currently has **0 rows**. This is a working UI/deployment milestone, not evidence that supplier inventory, image access, permissions or checkout acceptance are complete. The existing catalog-input dependency is already risk R2 in `docs/CRITICAL_PATH_RISKS.md`.

**Possible solution:** Read-only acceptance inventory for supplier-provided catalog, images, publish flags, role-scoped edits and audit history; test with nontransactional demonstration data and independently verify role isolation before proposing launch readiness.

**Recommendation:** Keep demo-only and do not represent the storefront as catalog-ready or activate real payments/fulfillment. Any production data, auth, payment or deployment change requires separate approval.

**2026-11-01 evidence:** Hosted Apex Supabase now contains **one product (SKU 1001), active but unpublished** (versus zero products in Oct 31 review). This is a material change from empty catalog to first saved draft, **not** public catalog acceptance. Latest verified Vercel production deployment is READY at main commit `1c4367e` (CSV blank-SKU reimport identity fix); payment PRs #109–#119 remain separate draft/test branches. **Recommendation:** verify supplier bulk import, image/price privacy, publication, role scope and checkout acceptance before claiming storefront readiness.

---

## 3. Runtime patch readiness for the deployed storefront

**Status:** Evaluate / read-only version audit  
**Added:** 2026-10-31  
**Last reviewed:** 2026-10-31

**Evidence:** Apex Vercel project is configured for Node **22.x**; repository `package.json` has no `engines.node` and declares Next.js `^16.0.0` (the lockfile/deployed resolved patch version was not established in this review). Vercel announced Node 26 LTS GA Oct 29, default for new projects, with conditional existing-project upgrades. Next.js plans seven medium-severity fixes Nov 3; affected versions are not yet established. Sources: https://vercel.com/changelog/node-js-26-lts-is-now-generally-available-on-vercel ; https://nextjs.org/blog/upcoming-nextjs-security-release-november-2026 .

**Possible solution:** Read-only inspect deployed Node/Next versions, lockfile and CI settings; test storefront, supplier auth, catalog image access and session flows on patched versions in isolation.

**Recommendation:** No runtime/framework changes or deployment without regression evidence and explicit approval. Keep real checkout disabled pending existing payment and compliance gates.


## 4. BTCPay/Prism split-change approval and settlement evidence

**Status:** Evaluate / nonproduction regtest tests passed; live activation remains blocked  
**Added:** 2026-11-01  
**Last reviewed:** 2026-11-01

**Finding:** Draft stacked Apex PRs #109–#119 now cover ephemeral BTCPay regtest, signed invoice webhooks, two-recipient Prism on-chain forwarding, 90/10 and 85/15 reconciliation, and admin-only split review. PR #119 reports passing exact-head disposable PostgreSQL/RLS, app quality and real Prism regtest checks, but remains **draft/unmerged**. Its review state `approved_pending_manual_sync` is **not** a live payout activation or proof of race-free settlement. Prism's store-level split is read at confirmation; concurrent new invoices and split edits require coordinated finality and locking. Hosted Supabase has **zero** allocation snapshots or split drafts.

**Why it matters:** Admin-adjustable supplier/platform splits must not retroactively change older unsettled invoices, double-pay recipients, or expose wallet authority to the storefront.

**Possible solution:** After review, design a per-store transactional activation barrier coordinating *all* invoice writers and Prism sync, with immutable rule versions, independent finality evidence, rechecks under lock, idempotent ledger reconciliation, and a manual recovery/rollback procedure. Continue using disposable regtest and isolated wallets.

**Recommendation:** Keep PR #119 and dependencies draft; review exact-head CI and real Prism receipts, then separately approve any production schema, live activation, hosting or wallet integration. No live coins, no mainnet, no admin activate button. Reference: https://github.com/zanibethel/apex/pull/119 .
