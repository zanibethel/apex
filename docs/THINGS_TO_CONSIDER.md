# Things to Consider — Apex

Review-only external intelligence. Not approved code, wallet, payment, security-policy, or production changes. Keep partner identities, keys, addresses, and private terms out of this public repository.

Last reviewed: 2026-11-05

## 1. Isolate Bitcoin signing and payment authority from web/worker compromise

**Status:** Evaluate / release-gate evidence pending  
**Added:** 2026-10-30  
**Last reviewed:** 2026-11-02

**Finding:** Binance reported an estimated $6.3B exchange theft on Oct 29–30; its *preliminary* investigation suggests a compromised DevOps laptop/service container enabled unauthorized withdrawals, without evidence of leaked private keys. This is a separate exchange incident, **not** evidence that BTCPay Server, Prism or Apex were compromised. Source: https://www.binance.com/en/square/post/10-30-2026-binance-stated-that-the-security-incident-affected-approximately-6-3-billion-with-about-3-billion-frozen-382718598048399 .

**Project intersection:** The proposed BTCPay + Prism 90/10 BTC payout design in `docs/PAYMENTS_AND_LEDGER.md` and existing risks R1/R6 in `docs/CRITICAL_PATH_RISKS.md` already require verified signer ownership, idempotent payouts and no secrets in Git. Today's incident adds concrete external evidence for separating web/admin/agent access from signing authority and independently verifying outgoing destinations and settlement. No live Apex wallet, checkout or signing integration is established.

**Possible solution:** Before any live payment proposal, document threat boundaries for developer laptops, Vercel/Supabase, BTCPay host, Prism payout service, wallet signer, and admin recovery. Test least-privilege credentials, signer isolation, withdrawal limits or manual approval, revocation, recipient allowlists, two-destination testnet reconciliation, incident pause, and restore. Require an independent reviewer and documented release-gate evidence.

**Recommendation:** Keep testnet/mock-only. Read-only threat-model review is appropriate; **do not** add wallet keys, live payout flows, signing permissions or new deployment policy without explicit approval. Existing legal/payment eligibility gates remain in force.

**2026-10-31 evidence:** Binance's Oct 30 official update now says the preliminary compromised-laptop explanation was incomplete: investigators found additional breach points, while the full root cause remains under investigation. Binance reports ~$3B frozen and says withdrawals remain suspended pending checks. This strengthens the existing signer/authorization/revocation threat-model gate; it does not establish any Apex, BTCPay or Prism exposure. Source: https://www.binance.com/en/support/announcement/detail/d3306d9dca5243548c813b605e1d1751 .

**2026-11-01 evidence:** Reuters reports Binance resumed selected BTC/ETH/stablecoin withdrawals in phases after replacing about 95% of stolen tokens; the incident is still under investigation. Wiz's Oct 30 report documents nine AI-developer-platform incidents targeting stored secrets and large-scale provider-key abuse. Neither establishes Apex/BTCPay/Prism compromise. **Possible solution:** read-only inventory of supplier/admin, Vercel/Supabase, CI, BTCPay and wallet signer authority; keep keys out of code, isolate signer and verify revocation. **Recommendation:** preserve no-mainnet release gate. Sources: https://www.reuters.com/legal/government/binance-resumes-bitcoin-withdrawals-after-covering-bulk-stolen-63-billion-2026-11-01/ ; https://www.wiz.io/blog/black-october-for-ai-developer-platforms .

---

**2026-11-02 evidence:** Reuters reports approximately **$4.72B net customer outflows** following Binance's phased reopening, with about $2.7B flowing back; the exchange says outflows are stabilizing. This reinforces custody/incident-recovery and independent settlement controls but does **not** establish Apex/BTCPay/Prism exposure. **Recommendation unchanged:** keep signer isolation, revocation, recipient verification and no-mainnet gate. Source: https://www.reuters.com/business/finance/binance-sees-outflows-stabilising-exchange-returns-online-after-63-billion-heist-2026-11-02/ .

## 2. Storefront deployment versus catalog acceptance

**Status:** Implemented private catalog/held-only review; Evaluate publication and checkout acceptance  
**Added:** 2026-10-31  
**Last reviewed:** 2026-11-03

**Evidence:** Vercel's latest READY production deployment is Apex main commit `7c106fcc` (mobile supplier product cards/source-cost editing); the connected Supabase `products` table currently has **0 rows**. This is a working UI/deployment milestone, not evidence that supplier inventory, image access, permissions or checkout acceptance are complete. The existing catalog-input dependency is already risk R2 in `docs/CRITICAL_PATH_RISKS.md`.

**Possible solution:** Read-only acceptance inventory for supplier-provided catalog, images, publish flags, role-scoped edits and audit history; test with nontransactional demonstration data and independently verify role isolation before proposing launch readiness.

**Recommendation:** Keep demo-only and do not represent the storefront as catalog-ready or activate real payments/fulfillment. Any production data, auth, payment or deployment change requires separate approval.

**2026-11-01 evidence:** Hosted Apex Supabase now contains **one product (SKU 1001), active but unpublished** (versus zero products in Oct 31 review). This is a material change from empty catalog to first saved draft, **not** public catalog acceptance. Latest verified Vercel production deployment is READY at main commit `1c4367e` (CSV blank-SKU reimport identity fix); payment PRs #109–#119 remain separate draft/test branches. **Recommendation:** verify supplier bulk import, image/price privacy, publication, role scope and checkout acceptance before claiming storefront readiness.

---

**2026-11-02 material status change:** Apex production Vercel deployment is **READY at `4f42400b`** (merged PR #151, verified-only read-only sold-out storefront projection with pagination and an independent global release gate); merged PR #150 enables private source-linked cards without a review-first UI blocker. Hosted Supabase has **63 import candidates** (62 `unverified`, 1 `approved_for_draft`), but still **only 1 saved product** (SKU 1001, active, **unpublished**), and zero payment allocations/split drafts. A private source-card path or read-only sold-out projection does **not** make unverified candidates public, publish products, create inventory, or establish checkout readiness. **Possible solution:** test import→verification→private draft→published visibility under the global gate, zero-stock projection, role isolation, truthful price and image permissions with nontransactional fixtures. **Recommendation:** acceptance review only; no public sellable inventory or live checkout activation without separate approval. References: https://github.com/zanibethel/apex/pull/150 ; https://github.com/zanibethel/apex/pull/151 .

**2026-11-03 material status change:** Hosted Supabase now contains **63 saved products** (vs 1 Nov 2), **all priced with source cost, compare-at price and image paths**, spanning **9 categories**; **63 inventory rows, 0 on hand, 0 reserved, 0 published** (50 active). The 63 source-import candidates remain **62 unverified / 1 approved-for-draft**, so saved records do **not** imply source verification or public release. Latest Vercel READY production main is **`cbfbe37`** (PR #188: held-only order/BTCPay intent journal), following PRs #185 private real-catalog checkout review, #186 audited category rename and #187 read-only BTCPay Greenfield connection verification. **Possible solution:** read-only supplier/admin/public-role and zero-stock acceptance matrix, source provenance and compare-at calculations, and held-only intent audit; preserve public-release and real-money gates. **Recommendation:** do not equate 63 saved drafts with public sellable products or enabled payments. References: https://github.com/zanibethel/apex/pull/185 ; https://github.com/zanibethel/apex/pull/187 ; https://github.com/zanibethel/apex/pull/188 .

## 3. Runtime patch readiness for the deployed storefront

**Status:** Evaluate / read-only version audit  
**Added:** 2026-10-31  
**Last reviewed:** 2026-11-03

**Evidence:** Apex Vercel project is configured for Node **22.x**; repository `package.json` has no `engines.node` and declares Next.js `^16.0.0` (the lockfile/deployed resolved patch version was not established in this review). Vercel announced Node 26 LTS GA Oct 29, default for new projects, with conditional existing-project upgrades. Next.js plans seven medium-severity fixes Nov 3; affected versions are not yet established. Sources: https://vercel.com/changelog/node-js-26-lts-is-now-generally-available-on-vercel ; https://nextjs.org/blog/upcoming-nextjs-security-release-november-2026 .

**Possible solution:** Read-only inspect deployed Node/Next versions, lockfile and CI settings; test storefront, supplier auth, catalog image access and session flows on patched versions in isolation.

**Recommendation:** No runtime/framework changes or deployment without regression evidence and explicit approval. Keep real checkout disabled pending existing payment and compliance gates.

**2026-11-03 evidence:** Vercel announced automatic blocked-npm-package checks before/during new builds on Nov 2, including supported lockfiles and cached installs; this does not prove already-deployed functions safe. No verified Nov 3 Next.js affected-version matrix was available at the morning review. **Recommendation unchanged:** inspect exact lockfile/deployed runtime and test catalog/admin/held-checkout regressions before any approved patch. Source: https://vercel.com/changelog/blocking-malicious-npm-packages-before-and-during-installation .

## 4. BTCPay/Prism split-change approval and settlement evidence

**Status:** Evaluate / nonproduction split tests passed; read-only Greenfield and held-only journal deployed; live activation blocked  
**Added:** 2026-11-01  
**Last reviewed:** 2026-11-03

**Finding:** Draft stacked Apex PRs #109–#119 now cover ephemeral BTCPay regtest, signed invoice webhooks, two-recipient Prism on-chain forwarding, 90/10 and 85/15 reconciliation, and admin-only split review. PR #119 reports passing exact-head disposable PostgreSQL/RLS, app quality and real Prism regtest checks, but remains **draft/unmerged**. Its review state `approved_pending_manual_sync` is **not** a live payout activation or proof of race-free settlement. Prism's store-level split is read at confirmation; concurrent new invoices and split edits require coordinated finality and locking. Hosted Supabase has **zero** allocation snapshots or split drafts.

**Why it matters:** Admin-adjustable supplier/platform splits must not retroactively change older unsettled invoices, double-pay recipients, or expose wallet authority to the storefront.

**Possible solution:** After review, design a per-store transactional activation barrier coordinating *all* invoice writers and Prism sync, with immutable rule versions, independent finality evidence, rechecks under lock, idempotent ledger reconciliation, and a manual recovery/rollback procedure. Continue using disposable regtest and isolated wallets.

**Recommendation:** Keep PR #119 and dependencies draft; review exact-head CI and real Prism receipts, then separately approve any production schema, live activation, hosting or wallet integration. No live coins, no mainnet, no admin activate button. Reference: https://github.com/zanibethel/apex/pull/119 .

**2026-11-03 evidence:** Apex production main now includes PR #187's **read-only, store-scoped BTCPay Greenfield connection verifier** and PR #188's **private held-only order/provider-intent journal**; these are infrastructure/acceptance milestones, **not** live invoice creation, successful payout, settlement or an activated Prism split. Hosted `store_split_drafts` and allocation snapshots remain empty. **Possible solution:** review real-provider connection and held-intent audit without exposing secrets; continue per-store immutable split/finality/race tests in disposable regtest. **Recommendation:** retain explicit mainnet/live-transaction approval gate and no automatic activation. References: https://github.com/zanibethel/apex/pull/187 ; https://github.com/zanibethel/apex/pull/188 .



**2026-11-04 catalog and payment release-gate recheck (existing items 2–4):** Hosted Apex `products` table remains **63 saved / 0 published**. This does not establish inventory, supplier verification, shipping readiness or live Bitcoin checkout. Reuters Nov 4 describes continuing cryptocurrency volatility after the Binance breach and US midterms; this is external market/security context, not evidence of Apex/BTCPay/Prism compromise. **Status:** Catalog acceptance pending; live payment activation blocked (unchanged). **Possible solution:** read-only supplier/catalog/inventory/order-detail acceptance, payout-signing isolation and immutable split-finality review, with no mainnet credentials or order execution. **Recommendation:** preserve held-only checkout and explicit release gates; no code, deployment, wallet or payment policy change. Source: https://www.reuters.com/business/finance/crypto-dips-democrat-midterm-wins-binance-hack-dent-optimism-2026-11-04/ .


**2026-11-05 catalog/payment-gate review (existing catalog and signing entries):** Connected hosted database confirms **63 products / 0 published / 50 active**, unchanged from Nov 4. Public catalog readiness, independently eligible order fulfillment, BTCPay settlement and live payout authorization are not established by saved product counts. Reuters Nov 5 reports ongoing post-election AI infrastructure volatility; cryptocurrency market recovery is not evidence of safer wallet operations. **Status:** Catalog acceptance pending; live payment and shipment release gates unchanged. **Possible solution:** read-only supplier-scoped order-detail, inventory/publish, CSV fulfillment, signing-isolation and settlement-finality acceptance evidence before any activation. **Recommendation:** no mainnet signing, live checkout, shipping or policy changes. Sources: https://www.reuters.com/business/energy/global-markets-global-markets-2026-11-05/ ; connected Apex Supabase read-only snapshot.
