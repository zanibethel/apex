# Security, compliance and launch gates

## Engineering security baseline
- All secrets in approved deployment secret stores; **never** in GitHub/README/client code. Document `.env.example` placeholders only after required settings are known.
- MFA for admin accounts, least privilege, audited role changes, server-side authorization and Supabase RLS tested for denial across suppliers.
- Input validation, rate limits, CSRF/session protections as appropriate, signed requests/webhooks, idempotent events, security headers and audit logging.
- Restricted admin ports on VPS, SSH keys, no root-password login, automatic security updates with controlled release window, private VPN/WireGuard maintenance.
- Encrypt backups, test restoration, monitor uptime/failed reconciliations/disk usage and preserve operational incident notes.
- Do not put customer medical or other sensitive personal information into emails or public logs.
- Separate staging/testnet from production; approval and change log before deployment.

## Payment-specific release gate
- Verify merchant and product eligibility before live sales.
- Establish legal ownership/control of wallets, invoice receiving funds, Prism signing authority and payout processor responsibilities.
- Determine whether intermediate custody or forwarding triggers money-transmission/licensing obligations; obtain qualified review where necessary.
- Independent test evidence for 90/10 payout amounts and recipient addresses on the selected network.
- Test BTC invoice expiration, wrong amount, delayed/failed payouts, duplicate callbacks, refunds, reorgs, exchange-rate/fee snapshots.
- Set monitoring and halt-switch for unexpected split failures.

## Product/legal gate
The platform must not activate commercial checkout for regulated products unless supplier, product, distribution/fulfillment and jurisdictional rules permit the transactions, and relevant payment arrangements are approved. A label or product-description disclaimer alone does not establish authorization.

## Acceptance definition
**Technical MVP accepted**: UI, permissions, mock orders, reporting and test-network checkout meet tests.
**Approved for live**: only after technical MVP plus payment security, merchant/product compliance, signed partner terms, operating controls and explicit go-live authorization. These dates can differ.
