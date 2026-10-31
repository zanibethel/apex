# Things to Consider — Apex

Review-only external intelligence. Not approved code, wallet, payment, security-policy, or production changes. Keep partner identities, keys, addresses, and private terms out of this public repository.

Last reviewed: 2026-10-31

## 1. Isolate Bitcoin signing and payment authority from web/worker compromise

**Status:** Evaluate / release-gate evidence pending  
**Added:** 2026-10-30  
**Last reviewed:** 2026-10-31

**Finding:** Binance reported an estimated $6.3B exchange theft on Oct 29–30; its *preliminary* investigation suggests a compromised DevOps laptop/service container enabled unauthorized withdrawals, without evidence of leaked private keys. This is a separate exchange incident, **not** evidence that BTCPay Server, Prism or Apex were compromised. Source: https://www.binance.com/en/square/post/10-30-2026-binance-stated-that-the-security-incident-affected-approximately-6-3-billion-with-about-3-billion-frozen-382718598048399 .

**Project intersection:** The proposed BTCPay + Prism 90/10 BTC payout design in `docs/PAYMENTS_AND_LEDGER.md` and existing risks R1/R6 in `docs/CRITICAL_PATH_RISKS.md` already require verified signer ownership, idempotent payouts and no secrets in Git. Today's incident adds concrete external evidence for separating web/admin/agent access from signing authority and independently verifying outgoing destinations and settlement. No live Apex wallet, checkout or signing integration is established.

**Possible solution:** Before any live payment proposal, document threat boundaries for developer laptops, Vercel/Supabase, BTCPay host, Prism payout service, wallet signer, and admin recovery. Test least-privilege credentials, signer isolation, withdrawal limits or manual approval, revocation, recipient allowlists, two-destination testnet reconciliation, incident pause, and restore. Require an independent reviewer and documented release-gate evidence.

**Recommendation:** Keep testnet/mock-only. Read-only threat-model review is appropriate; **do not** add wallet keys, live payout flows, signing permissions or new deployment policy without explicit approval. Existing legal/payment eligibility gates remain in force.

**2026-10-31 evidence:** Binance's Oct 30 official update now says the preliminary compromised-laptop explanation was incomplete: investigators found additional breach points, while the full root cause remains under investigation. Binance reports ~$3B frozen and says withdrawals remain suspended pending checks. This strengthens the existing signer/authorization/revocation threat-model gate; it does not establish any Apex, BTCPay or Prism exposure. Source: https://www.binance.com/en/support/announcement/detail/d3306d9dca5243548c813b605e1d1751 .

---

## 2. Storefront deployment versus catalog acceptance

**Status:** Evaluate / supplier-data acceptance pending  
**Added:** 2026-10-31  
**Last reviewed:** 2026-10-31

**Evidence:** Vercel's latest READY production deployment is Apex main commit `7c106fcc` (mobile supplier product cards/source-cost editing); the connected Supabase `products` table currently has **0 rows**. This is a working UI/deployment milestone, not evidence that supplier inventory, image access, permissions or checkout acceptance are complete. The existing catalog-input dependency is already risk R2 in `docs/CRITICAL_PATH_RISKS.md`.

**Possible solution:** Read-only acceptance inventory for supplier-provided catalog, images, publish flags, role-scoped edits and audit history; test with nontransactional demonstration data and independently verify role isolation before proposing launch readiness.

**Recommendation:** Keep demo-only and do not represent the storefront as catalog-ready or activate real payments/fulfillment. Any production data, auth, payment or deployment change requires separate approval.
