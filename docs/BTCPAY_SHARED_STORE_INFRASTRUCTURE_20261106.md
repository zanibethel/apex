# Apex Track 2 — one-store BTCPay infrastructure readiness (2026-11-06)

## Noncommercial preparation only
One BTCPay **provider store**, called **Apex Anabolics**, must serve the initial
one Apex storefront; it is NOT a BTCPay store for each supplier. Three separately
verified recipient Bitcoin destinations correspond to Apex / Lily / Tierra.
Default draft entitlement: 1000 / 4500 / 4500 basis points. Platform remains
1000 bps; changing Lily from 4500 to any positive value below 9000 adjusts
Tierra to 9000 minus Lily. An admin draft does not change running Prism rules.

**No hosting purchased, provider account opened, production wallet configured,
credentials issued, invoice writer enabled, payout performed, DB migration,
or real payment activated by this change.** Existing 2-way and 3-way
disposable Prism 1.3.3 regtest fixtures remain unmodified.

## Recommended host for approval
Evaluate a single DigitalOcean Linux Basic Droplet (4 GiB RAM, 2 vCPU,
80 GiB SSD, $24/month published base price) with automated daily droplet
backups (30% extra = $7.20/month), about **$31.20/month** excluding
additional off-host encrypted exports, domain DNS, taxes, and transfer fees.
The 80 GiB profile exceeds BTCPay's bare-minimum 50 GiB small Bitcoin-only
pruned setup, but validate actual requirements and disk headroom before
payment. Use official Docker setup on Ubuntu/Debian, Bitcoin on-chain only
initially, secured HTTPS and independent restore verification. Operations,
node monitoring, full synchronization, software updates and wallet custody
remain owner responsibilities. A hosted service may cost less, but must
prove Prism 1.3.3 install, plugin admin rights, persistent backups and
single-store wallet controls before choosing it.

Sources: https://docs.btcpayserver.org/Docker/specs/
https://www.digitalocean.com/pricing/droplets
https://www.digitalocean.com/pricing/backups

## Connection contract and permissions
Retain the existing reviewed read-only Greenfield code. Introduce a stricter
one-store config check for /admin/btcpay. No new network POST calls.
Use Vercel *server-only* secrets in the environment where verifying:
- APEX_BTCPAY_BINDINGS_JSON: exactly one object in the existing array schema,
  containing apexStoreId (the authorized single Apex storefront UUID),
  providerUrl (HTTPS origin), providerStoreId (real store ID), and
  keyEnv: "APEX_BTCPAY_KEY_READ_ONLY".
- APEX_BTCPAY_KEY_READ_ONLY: BTCPay API key restricted to store-scoped
  btcpay.store.canviewstoresettings. Verify the permission set independently
  in the BTCPay UI; successful GET alone cannot prove least privilege.
- APEX_BTCPAY_KEY_INVOICE_WRITER: **do not set yet**. Reserved for a
  separate later key with ONLY required store-scoped invoice permissions,
  after approvals. Reusing the read token is explicitly rejected.
  Having a distinct key does not grant payment permission.
Do not use NEXT_PUBLIC_ keys, unrestricted tokens or supplier-specific
BTCPay configs. Create/rotate secrets directly in Vercel; never in GitHub
files or chat. Verify the provider origin, expected ID, USD default
currency and HTTPS before trusting the read. Confirm instance-version
API permissions in the server's /docs.

Read-only admin status must state independent wallet ownership, invoice
permissions, fee and refund policy, Prism synchronization and pending
invoice drain are **unverified**. All monetary/release flags remain false.

## Operator steps, **after explicit host-approval**
1. Choose provider and amount; provision only authorized test infrastructure
   with DNS such as btcpay.apexanabolics.co (do not modify existing web DNS).
2. Install supported BTCPay + signed/pinned Prism plugin; verify TLS, USD
   accounting currency and exactly one provider store. Prefer a
   separately backed-up, watch-only merchant wallet where suitable.
3. Independently verify three owners' wallet destinations off-channel.
   Do not request seeds/keys/signing devices in this app.
4. In BTCPay account API keys, create a store-scoped **view settings**
   key and store it as APEX_BTCPAY_KEY_READ_ONLY. Configure the single
   JSON binding through Vercel server-only secret fields.
5. Revisit /admin/btcpay; expect a verified read of the exact store
   name/identity, but still **NOT ready for live payments**.
6. Test signed event validation, Greenfield invoice persistence,
   immutable order/allocation snapshots, independent settlements and
   refunds/reorgs. Confirm Prism plugin version and whether it exposes
   a permissioned synchronization API. Do not presume such API exists.
7. For any changed payout rule: freeze new invoice creation; enumerate
   pending invoices and payout claims; independently reconcile and drain
   or hold every unsettled obligation; preserve original order version;
   then create a new future-effective rule; require readback, operator
   approval and manual release. Do not auto-retry ambiguous transfers.
8. Independently verify business/merchant authorization, products, supplier
   eligibility, custody, jurisdiction and carrier requirements. Only
   with an explicit separate approval may payment gates be considered.

## Outstanding technical requirements
- Privileged webhook signature verification plus ledger reconciliation;
  exact order invoice and price matching, bounded retries and no ambiguous
  transfer resends.
- Durable freeze/drain and future-effective immutable snapshot/fee,
  refund and reversal policies (network fee reserve and payout minimums).
- Verified source-supported Prism configuration sync or manual hold with
  on-server and on-chain readback. Existing regtest proof of static
  settings is not proof of remote safe rule edits.
- Separate read-only, invoice-writing and payout-signing authorities
  (do not put BTC private keys or payout signing secrets on Vercel).
- Real wallet verification, merchant/legal eligibility and independent
  restore test. Do not enable live checkout or shipments.
