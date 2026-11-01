# Prism plugin installation on disposable BTCPay regtest runner — 2026-11-01

**DRAFT. Test-only package compatibility/install attempt. DOES NOT ENABLE PRISM PAYOUTS.**

## Pinned software
- Real upstream BTCPay source: `381ad1f0ac32fb011163239fcacdde1e6f7538b9` (the existing proven CI revision).
- Published Prism: version **1.3.3.0**, from official BTCPay Plugin Builder endpoint, plugin identifier `BTCPayServer.Plugins.Prism` as used by `PluginManager`. Plugin metadata/source: https://plugin-builder.btcpayserver.org/public/plugins/prism and https://github.com/Kukks/BTCPayServerPlugins/tree/2b951b6f696396c29ae58e8d5dea981e2c3a1092/Plugins/BTCPayServer.Plugins.Prism
- The package is downloaded **only inside disposable GitHub Actions** after independent regtest check and from an HTTPS host; SHA-256 is displayed in CI for later review. **It is not yet checksum-pinned to an independently verified manifest** and must be reviewed before any production or trusted deployment.
- Archive validation checks zip traversal, symlinks, expected DLL, size and safety gates. It extracts to a **temporary plugin directory** set only for the test BTCPay process through `BTCPAY_PLUGINDIR`, never to hosted infrastructure.
- Smoke step verifies the server's Prism settings route is present behind cookie authentication and checks startup diagnostics. Existing real Greenfield invoice/payment/signed webhook/durable PostgreSQL tests must still pass with Prism present and **disabled/unconfigured**.
- All Docker volumes and plugin package bytes are discarded after CI. No third-party login, production API key, customer wallet, on-chain payout destination, paid VPS or Vercel change is involved.

## What remains NOT verified

1. Prism configured and actually forwarding an invoice payment: **not exercised in this PR**. Need to configure source `*CHAIN`, at least two destination aliases, a valid on-chain payout processor and enforce independently verified payouts. The `PrismController` in this published source is cookie-protected and there is no verified admin-facing Greenfield configuration API.
2. Actual Prism reserve/threshold calculations and 90/10 or 85/15 destinations: **not verified**. The separate Bitcoin Core payout verification in #115 is not Prism.
3. Apex admin split **draft → reviewed/active version → plugin settings sync → invoice snapshot**: not implemented. We must never secretly automate cookie-login or scrape privileged HTML forms as an activation workaround.
4. Real merchant and customer funds, public checkout, deployment and production infrastructure: disabled.

## Acceptance
- Exact-head GitHub Actions proves published Prism package downloads and loads on pinned BTCPay Server without breaking the already proven Greenfield regtest end-to-end test.
- If published API or runtime compatibility fails, retain the draft and report precise failure; do not use an alternate unreviewed plugin package, bypass signature/HTTPS, or claim Prism payout tests passed.
