# Bitcoin processor — isolated BTCPay testing spike (2026-10-30)

**Status: test-only source code in review. No server provisioned, no API keys connected, no live invoices, no checkout, no product orders, and no payouts.**

## Selected approach
- One Apex Next.js/Supabase storefront with a separate self-hosted BTCPay Server instance.
- BTCPay Greenfield invoices with a server-side scoped API key, checkout redirect returned by server, and verified signed webhooks.
- Evaluate Prism later for automated forwarding. **90% supplier / 10% platform** remains a draft allocation, not a verified direct split.
- One store per supplier as needed; supplier signing access should be independent.
- Exact integer USD cents and BTC satoshis; invoice/FX/fees/refund snapshots and separate receipts, entitlements, and outgoing payouts.

## Implemented in this pass
The source module at src/lib/payments/btcpay-sandbox.mjs is an unimported server-only proof of concept. It:
1. Rejects disabled mode, mainnet, unspecified network, invalid HTTP and malformed credentials.
2. Constructs a bounded USD test invoice from an opaque order reference using the Greenfield create-invoice endpoint.
3. Rejects unexpected returned checkout origins; never assumes redirect is proof of payment.
4. Verifies BTCPay-Sig HMAC-SHA256 against raw webhook request bytes in constant time, then checks the expected store.
5. Computes a non-executable draft supplier/platform split in exact integer satoshis.

There are deliberately NO API routes, database writes, account/payment credentials, deploy changes, checkout buttons, signer access, or automated wallet transfers. Webhook replay/idempotency and payment state transitions remain future work.

## Network reconciliation required
Apex's earlier supplier wallet-request drafts label destinations as **signet** and validate a tb1 prefix. That prefix alone cannot establish the Bitcoin network. Official BTCPay Docker documentation currently lists **mainnet, testnet and regtest** as standard configuration networks (not signet). For the first isolated spike choose regtest behind HTTPS, or testnet, and create fresh matching test wallets. Do not use the earlier Signet requests with a testnet/regtest payout workflow. Revisit the supplier request UI in a separate change.

Before making any test invoice, independently verify the remote node's chain with getblockchaininfo, the test wallet, checkout network and that only worthless test coins are accepted. The adapter's network setting is a caller declaration, NOT remote-chain attestation. No test network or wallet is set up yet.

## Provisioning — not performed
1. Select a dedicated Linux VPS, account owner, budget and DNS. Allow required HTTPS traffic and restrict administrative access through VPN.
2. Install official BTCPay Docker on regtest/testnet, without Lightning for MVP. Verify node/network, readiness, HTTPS.
3. Create a test account/store and fresh test receiving wallet. Issue a least-privilege store-scoped API key with btcpay.store.cancreateinvoice.
4. Register a webhook with a long secret and required invoice events. Keep every secret SERVER SIDE in approved secret storage, never in NEXT_PUBLIC variables, public GitHub or the browser.
5. Confirm Prism plugin compatibility with BTCPay version; examine signing/custody/forwarding mechanics and confirm two-recipient test settlement with fees and delayed payout conditions.
6. Exercise secure backup and restore, incident alerts, reconciliation, restart, network mismatch and signer-failure behavior before progressing.

## Next coding pass
- Review immutable Supabase tables for test orders, invoices, delivery idempotency, ledger entries, immutable commission snapshots, refund adjustments and payout attempts.
- Add a protected test-only worker/API with verified membership, amount reprice, discount reservation and rate limits. Never accept browser-provided totals as authoritative.
- On authenticated webhook delivery, fetch invoice status and additionalStatus using the scoped API, reconcile state and persist transitions atomically with duplicate-delivery handling.
- Test underpay, overpay, late pay, expiry, duplicate/reordered webhooks, cancellation, reorgs, delayed/failed payout and manual review.
- Do not activate commercial transactions for restricted products without merchant/product/jurisdiction permission, payment routing approval and partner terms.

## Tests
The accompanying Node unit tests cover disabled/mainnet rejects, amount validation, mock invoice requests, destination-origin rejection, sanitized errors, HMAC signature tamper checks, cross-store rejection, and exact split conservation. CI also checks lint, typecheck and build.

## Sources
- https://docs.btcpayserver.org/Developers/api/
- https://docs.btcpayserver.org/Developers/api/examples/
- https://docs.btcpayserver.org/API/Greenfield/v1/
- https://docs.btcpayserver.org/Docker/configuration/
- https://plugin-builder.btcpayserver.org/public/plugins/prism
- docs/PAYMENTS_AND_LEDGER.md
- docs/SECURITY_AND_RELEASE_GATES.md
