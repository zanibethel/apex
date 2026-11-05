# Apex — November 5–8, 2026 execution and closeout checkpoint

**Recorded:** November 5, 2026 (America/Chicago). **Scope:** verified technical state, end-of-week action plan and unmerged-PR triage. This document supersedes the November 3 checkpoint for current operational status; older plans remain historical. **Nothing here authorizes a live sale, Bitcoin charge, label purchase or shipment.**

## Verified production snapshot (November 5)

| Area | Verified result | Interpretation |
| --- | --- | --- |
| Repository | `zanibethel/apex` `main` at `75598b6d2955b16bf5bd0d05dd2900d0093e13da` following merged [PR #248](https://github.com/zanibethel/apex/pull/248) | Code release through #248 confirmed |
| Hosting | Vercel `apex` production deployment `dpl_EMFDrrDTBS7CTTd17GiZNkhG857N` **READY** on that exact SHA; `apexanabolics.co` listed as alias | Production build is live; commercial transactions are not |
| Latest PR test | Exact PR #248 source head `22d51b1e13d7e9145889bae14d046f1682a10593`: GitHub **Apex quality checks SUCCESS**; GitHub main SHA has Vercel success | CI/hosting verification, not order ingestion or shipping acceptance |
| Supabase | Connected project `fhqpkpztercadcxspdkg` **ACTIVE_HEALTHY**; private order foundation and supplier header migrations applied through version `20261105021347` | Existing hosted database; no additional migration required for #248 |
| Inventory/catalog | 63 products; 50 active; **0 published**; 13 without category; 63 source import candidates; 63 inventory entries; **0 on hand / 0 reserved** | Active does not mean public/available. Potential larger supply is still unverified |
| Orders | **0** supplier sales, **0** held-order snapshots, **0** line snapshots, **0** delivery envelopes | There is no real order data available to fill or ship |
| Commerce gate | `apex_internal.private_release_gate.enabled = false` | Live checkout, payment release and fulfillment remain disabled |

Numbers are a live read-only snapshot, not permanent assertions. Re-query before supplier intake, release, or launch decision. Do not put actual supplier files, customer records, wallet credentials or recipient addresses in this public GitHub repository.

## What's merged and available now

- [#243](https://github.com/zanibethel/apex/pull/243): exact already-applied private held-order migration recorded and tested.
- [#244](https://github.com/zanibethel/apex/pull/244): authenticated supplier aggregate order-detail readiness screen.
- [#245](https://github.com/zanibethel/apex/pull/245): strictly supplier-scoped, read-only original held-order header RPC; hosted migration applied.
- [#246](https://github.com/zanibethel/apex/pull/246): mobile-friendly protected held-order header browser.
- [#247](https://github.com/zanibethel/apex/pull/247): supplier-only **review** shipment summary; explicitly zero independently eligible shipments.
- [#248](https://github.com/zanibethel/apex/pull/248): supplier-scoped cumulative **metadata-only** held-order CSV. Original identity/timestamp retained; cross-store access, duplicates, data inconsistencies and partial export fail closed. Existing backend paging limits a complete export to **1025 held order IDs**; above that, export refuses rather than silently truncating.
- Previously merged [#210](https://github.com/zanibethel/apex/pull/210)–[#212](https://github.com/zanibethel/apex/pull/212): supplier daily sales reports, opt-in Resend sender setup, sales-review CSV with duplicate/stale protections; [#223](https://github.com/zanibethel/apex/pull/223)–[#226](https://github.com/zanibethel/apex/pull/226): owner progress/expense email and HTML polish. **Configured code does not by itself prove end-recipient delivery.**
- Existing catalog cards, mobile bulk edit, shipping policy estimates and review-only payment/regtest harness are implemented. None overrides release gates or constitutes a production mainnet payout path.

## Unmerged PR audit — do not bulk merge

GitHub PR search on November 5 returned **63 open PRs**. Breakdown by branch lineage: **1 umbrella PR** [#242](https://github.com/zanibethel/apex/pull/242), **22 legacy stacked payment/regtest PRs** in #104–#127, and **40 other older PRs** in #29–#83. These are not 63 mutually independent release tasks.

- **#242: OPEN, not merged, currently not mergeable onto main.** It bundled the #214–#217 held-order foundation and review-only workflows. Production-safe portions were deliberately split into and merged through #243–#248. Do not merge #242 as a shortcut: review remaining diff against current `main`, explicitly identify any unshipped pieces, then close as superseded or open separate bounded PRs after validation.
- **#104–#127 payment drafts:** primarily stacked on other draft branches and isolated `apex_test`/Bitcoin regtest exercises. Do not retarget or merge wholesale. Compare each to later merged #160–#175 work and keep unique proof/tests only if justified.
- **#29–#83 older open PRs:** assorted earlier auth/UI/RLS/payout/catalog proposals, many with newer merged successors. Audit lineage, current diff, checks and production schema history individually before marking superseded; never reapply an already-hosted migration.
- Closing an obsolete PR is housekeeping, not lost implementation. Keep issue acceptance criteria open where the operational feature remains missing.

## Remaining critical work (not delivered by #248)

| Issue | Incomplete requirement | Dependency / exit evidence |
| --- | --- | --- |
| [#213](https://github.com/zanibethel/apex/issues/213) | Verify any expanded supplier list; map to 63 saved SKUs, resolve duplicates, categories/media and physical-stock claims | Authorized private source, per-item review and explicit inventory evidence; don't assume the Nov 4 handoff arrived |
| [#214](https://github.com/zanibethel/apex/issues/214) | Connect an independently attested, eligible order source to private immutable line/delivery snapshots | The deployed schema/header browser has **zero** actual source orders and no intake worker; protect recipient data and payment finality |
| [#215](https://github.com/zanibethel/apex/issues/215) | Operational partial-fulfillment queue, valid status transitions, audited tracking and protected delivery handoff | Current #247 is **review-only**; mutation/labels/dispatch intentionally absent |
| [#216](https://github.com/zanibethel/apex/issues/216) | Cumulative **fulfillment** CSV upload/reimport, duplicate-safe row/version conflicts and authorized tracking fields | #248 exports only held metadata; no upload or shipment write API. Validate Day 3 + Day 4 repeated-ID example in isolated tests |
| [#217](https://github.com/zanibethel/apex/issues/217) | Secure daily actionable pending-order attachment or authenticated download, delivery proof and carried-forward counts | Current opted-in sales-summary email is not a shipping-ready order attachment; requires verified order/recipient fields |
| [#218](https://github.com/zanibethel/apex/issues/218) | Supplier-managed USPS production authorization, eligible label quotes/purchases and tracking provider synchronization | Current page is readiness/planning; no purchased labels or carrier write permissions |
| [#219](https://github.com/zanibethel/apex/issues/219) / [#222](https://github.com/zanibethel/apex/issues/222) | Provider delivered/bounced alerts, DST/cron confirmation, owner weekly progress email and receipt-backed expenses | Verify actual accepted **versus delivered**, opt-in and recurring cost estimates against invoices; do not claim a report was sent without receipt |
| [#220](https://github.com/zanibethel/apex/issues/220) / [#8](https://github.com/zanibethel/apex/issues/8) / [#11](https://github.com/zanibethel/apex/issues/11) | Release gate review, supply/product eligibility, identity, BTCPay/Prism production credentials, payout/recovery and shipping legality | Test-network evidence and production hosting alone do not approve live commerce |

**Security advisor follow-up:** Current Supabase advisor returns 19 `INFO` RLS-with-no-policy notices, 6 `WARN` anonymous-callable SECURITY DEFINER functions, 32 `WARN` authenticated-callable SECURITY DEFINER functions, and 1 `WARN` for leaked-password protection disabled. These are advisory findings, **not a verified exploit**. Triage each function's grants, claims, store tenancy and input validation, document accepted intentional denies and repair real exposures before any commerce release. References: [RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous definer](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## November 5–8 focused execution plan

| Target | What we can actually finish this week | Done means |
| --- | --- | --- |
| **Thu Nov 5** | Merge this documentation checkpoint; audit #242 against merged #243–#248; determine whether supply update exists; review 13 uncategorized items without guessing content | Current source of truth, supersession list, requested private supplier intake and unchanged commerce gate |
| **Fri Nov 6** | Start one bounded #216 **review-only** import/conflict parser/test PR (original order IDs, repeated uploads, stale versions); run supplier mobile and CSV download smoke | Exact-head tests and preview green; no tracking write, address leak or shipping activation |
| **Sat Nov 7** | Follow #219 email delivery and cron monitoring, check owner report #222 coverage, run access-control/security-advisor triage | Verified evidence for cron/provider delivery, classified DB warnings and actionable fixes (not just a green Vercel deploy) |
| **Sun Nov 8** | Regression and dependency review: supplier signup, catalogs, protected reports, CSV, roles, zero-stock status, recovery and backlog disposition | CI and production smoke recorded; blockers/owners dated; leave payment/fulfillment gates off |

**End-of-week success criterion:** all **documentation and technical review milestones** above have evidence; remaining open PRs are labeled by superseded vs active intent; no unverified commerce features are claimed shipped. Completing **live** purchasing, supplier shipment operations, production Bitcoin settlement and USPS labels by Nov 8 is **not an evidence-backed commitment** and depends on real source data, authorized accounts and separate acceptance.

## Decisions and blockers to collect from the owner/suppliers

- Was the potential Nov 4 supplier list actually received? If yes, verify via private authorized channel and produce the existing/new/conflicting SKU diff; if not, label **AWAITING SUPPLIER**, not zero stock received.
- Are any actual goods physically received, approved and eligible to list or transport? Saved catalog entries are not that evidence.
- Are BTCPay mainnet store/wallet roles, payout authority, supplier-operated USPS and carrier eligibility independently approved? Treat unverified as blocked.
- Confirm Proton/domain purchase invoices against owner-approved **estimates**; do not classify estimated spend as paid.
- Test Resend daily and owner weekly messages at real opted-in addresses; capture provider delivery and bounce state without exposing recipient data in public artifacts.

## Guardrails for the next PR

Branch from current `main`; one small feature; link the issue and original order IDs where relevant; exact-head lint/typecheck/unit/DB-tenant/Next build/Vercel preview; inspect grants and false release gate; merge only after checks; confirm production READY on merged SHA. Do **not** duplicate hosted migrations, reveal sealed delivery data to the browser, import live fulfillment state from unchecked CSV or turn on any payment/postage operation.
