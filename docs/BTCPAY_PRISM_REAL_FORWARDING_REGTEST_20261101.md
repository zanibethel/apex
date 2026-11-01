# Real Prism forwarding acceptance — disposable GitHub Bitcoin regtest

**STATUS: TEST PR ONLY. NOT VERIFIED UNTIL EXACT-HEAD GITHUB CI PASSES. NO PRODUCTION CHANGE.**

After #116 verified Prism 1.3.3 plugin installation, this pass adds a real on-chain payout test using **Prism-generated payout claims** rather than Bitcoin Core `sendmany`.

## Controlled experiment
1. First complete the previous real BTCPay invoice → mined regtest payment → signed settlement webhook → disposable PostgreSQL receipt journal path.
2. Create **two separate synthetic BTCPay stores** on the same temporary runner, one with versioned **90/10** allocation and one with **85/15**. Each uses only synthetic approved-test-fixture rules. No Apex dashboard draft is activated.
3. Generate one throwaway BTCPay **hot wallet** per test store (private keys strictly ephemeral; never logged or saved to GitHub). Configure the **supported** Greenfield `OnChainAutomatedPayoutSenderFactory/BTC-CHAIN` processor for each store.
4. Create independent synthetic supplier/platform Bitcoin Core regtest receiving wallets and independently verify their bech32 addresses.
5. Seed Prism 1.3.3 `PrismSettings` JSON into the **upstream BTCPay development PostgreSQL** *only*, in a locally bound disposable test database. This is solely test harness setup, **not** a supported admin-to-Prism configuration API. Restart test BTCPay so the actual Prism plugin loads settings.
6. Issue one 1,000,000-satoshi regtest invoice per store, fund with mined worthless test coins, mine confirmations, and wait for actual BTCPay Greenfield `Settled`.
7. Require **exactly two payout claims per store** reported through Greenfield, with metadata indicating source `Prism` and method `BTC-CHAIN`. Then independently verify on-chain receipts in BOTH recipient wallets at one or more confirmations, matching the expected 2% Prism reserve amounts.
8. Fail closed on missing claims, wrong method, mismatched ratios, missing receiver funding, non-regtest addresses, uncleared settlement or mismatched amount. Destroy all disposable wallets, databases and plugin binaries after the run.

## Non-goals and exclusions
- This is a **regtest plugin integration acceptance**, not production-ready merchant payouts or a guarantee of fee treatment on mainnet.
- **No live payout or customer funds**, Vercel, production database, public checkout, new VPS, wallet mnemonic logging or general plugin-setting API.
- Any Prism settings and on-chain processor change in this test is **private, synthetic and disposable**. Apex admin split UI still writes drafts only.
- Prism currently reads store split settings at payment **confirmation**, not at order creation. Therefore historical payout snapshots are **not guaranteed** simply by changing store-level settings: keep admin activation blocked until a reviewed lock/wait-for-pending-invoices or per-invoice versioned mapping is proven.
- Actual amounts on wallets may account for Prism reserve; do not describe the nominal 90/10 as an absolute received-after-fees guarantee.
