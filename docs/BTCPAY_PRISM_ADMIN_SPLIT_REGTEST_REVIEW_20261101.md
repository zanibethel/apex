# Apex configurable payout rules — regtest payout contract (2026-11-01)

**DRAFT, CI TEST ONLY. NO LIVE PAYOUTS OR PRISM INSTALLATION.**

## Current milestone

This branch tests a *frozen synthetic admin-selected rule* against real Bitcoin Core regtest wallets. It is **not** a Prism forwarding success. An approved_test_fixture is a deliberately synthetic marker, not a production-approved rule or an actual admin dashboard activation. All current real admin dashboard changes continue to create **drafts**, gated by feature flags.

The payout contract is **versioned**, not hardcoded. Examples:
- Rule version 1: supplier 9,000 basis points (90%) + platform 1,000 (10%).
- Rule version 2: supplier 8,500 basis points (85%) + platform 1,500 (15%).

Each synthetic order freezes the selected version, scope, recipient IDs and allocation amounts at creation, before subsequent admin changes. Rules must total exactly 10,000 basis points; duplicate recipients, unapproved draft flags, missing scope identity and non-regtest requests fail closed. Calculations use BigInt integer satoshis with deterministic largest-remainder rounding.

A Bitcoin Core regtest scenario verifies the **actual recipient wallet receipts** and a separate merchant-funded network fee for each of those two rules. This is a two-output `sendmany` experiment and explicitly **not** Prism. It does not touch a customer order, checkout route or actual merchant wallet.

## Upstream Prism review — source pinned at 2b951b6f696396c29ae58e8d5dea981e2c3a1092

- Plugin directory: https://plugin-builder.btcpayserver.org/public/plugins/prism — published Prism 1.3.3 (Aug 19, 2026), minimum BTCPay 2.3.7. The active upstream BTCPay version in CI must be checked for plugin compatibility before installation.
- Source README: https://github.com/Kukks/BTCPayServerPlugins/blob/2b951b6f696396c29ae58e8d5dea981e2c3a1092/Plugins/BTCPayServer.Plugins.Prism/README.md
- Source settings: `PrismSettings.Reserve=2` (default 2% fee reserve); `SatThreshold=100` default; destination-specific overrides and pending payout state. Actual wallet net receipts therefore may differ from nominal percentage entitlement.
- Plugin README says unsettled/pending payout transfers can block additional automatic transfers; reconciliation and operator alerts are mandatory.
- `PrismController` uses cookie-authenticated store settings forms at `/plugins/{storeId}/prism`; this source review does **not** establish a supported Prism Greenfield endpoint to programmatically change the split from Apex Admin. Do **not** automate HTML/form scraping, send admin cookies to a background worker, or claim admin drafts automatically configure Prism.
- Prism's `*CHAIN` source is an on-chain invoice payment class and `*All` also encompasses lightning. **Do not conflate Prism's global on-chain source rule with Apex product/supplier-level commission rules.** Multi-supplier mixed-cart allocation may require per-store invoice separation, custom metadata mapping or a reviewed extension. Verify actual plugin routing behavior first.

## Pending work before customer funds

1. Install the exact reviewed Prism plugin package onto a disposable, version-compatible BTCPay regtest instance, with configured on-chain payout processor and separate recipient test destinations; independently verify two destination payouts **created and confirmed by Prism itself** (not Bitcoin Core's `sendmany`).
2. Reconcile entitlements vs Prism fee reserves, payout thresholds, wallet fees, partial funding, retries and pending payout state; test both 90/10 and 85/15 after safe configuration changes.
3. Build a proper admin-approved activation workflow: draft → reviewed → effective, immutable version, authority checks, backend-held synchronization/approval and status reconciliation; preserve each order's original rule snapshot even if newer splits are edited.
4. Confirm whether per-product/per-supplier rules can safely map to Prism on-chain invoice events without cross-supplier leakage. Keep payouts disabled if unsupported or inconsistent.
5. No hosted Supabase SQL, production Vercel, real Bitcoin, mainnet address, wallet signing secret or merchant payout activation in this PR.

## GitHub CI

`node --test tests/synthetic-payout-rule-snapshot.test.mjs` verifies immutable versioned allocation, 90/10 and 85/15, exact satoshi rounding, forged/draft rules and network denial. The existing disposable Bitcoin Core workflow now runs a second real-world test script using both ratios and validates outgoing addresses' actual wallet receipts and fee spending. This requires no paid VPS or live setup.
