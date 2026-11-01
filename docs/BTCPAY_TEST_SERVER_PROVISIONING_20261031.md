# Optional BTCPay hosted test-server fallback — deferred (2026-10-31)

**STATUS: OPTIONAL FALLBACK ONLY, NOT OUR CURRENT PLAN.** The agreed plan is **local BTCPay regtest first, then ONE paid production VPS**. See [local-first strategy](BTCPAY_LOCAL_FIRST_STRATEGY_20261031.md). Do not create a DigitalOcean Droplet or a test subdomain now. No VPS purchased or connected, no DNS configured, no BTCPay instance, no wallet, no Prism installation, no checkout or transfers. This document is retained solely if temporary hosted staging is later required and explicitly authorized.

## Fixed scope
- Apex uses one shared storefront; supplier authorization and payout percentages remain controlled in the Apex application.
- A separate Linux VPS hosts the BTCPay Docker stack, PostgreSQL, NBXplorer and Bitcoin Core.
- First proving network: **Bitcoin regtest** with worthless coins. No mainnet and no Lightning.
- Prism **candidate only**: verify compatibility and actual payout forwarding in a later separate test pass. Do not infer direct in-transaction splitting.
- This deployment is isolated from the existing Apex Signet-only pending wallet requests; do **not** reuse them.
- No production merchant transactions or commercial activation. Any later release requires merchant/product/payment authorization.

## Hosting candidate (DEFERRED and NOT purchased)

**Fallback candidate only:** DigitalOcean, **Basic Droplet** (regular shared CPU), 2 vCPU / 4 GiB RAM / 80 GiB SSD, approximately **US$24/month** at the October 31, 2026 published rate. First-choice location: **NYC3** (verify plan capacity when creating). OS: Ubuntu 24.04 LTS x64. Weekly DigitalOcean Droplet backup adds 20% (approximately **US$4.80/month**), for a proposed total of **US$28.80/month** before taxes and other costs.

This is a **deferred fallback recommendation only, not an instruction to provision a server.** No DigitalOcean account is connected, no Droplet has been created, no billing authorization has been granted, and the price must be confirmed in the DigitalOcean creation screen before purchase.

This plan exceeds BTCPay's 2-core/4-GB starting profile and provides additional headroom beyond its 50-GB minimal pruned BTC installation. Use `opt-save-storage-xs` when evaluating a future small **pruned Bitcoin mainnet** installation, following the official storage documentation; the **initial test setup must stay regtest**. Do not represent a regtest test as a mainnet synchronization test.

Only after separate explicit approval for a **temporary** publicly reachable test server, follow this DigitalOcean creation checklist. Destroy the temporary Droplet after the test and confirm billing stopped:
1. Create a dedicated Apex-owned DigitalOcean project and Basic regular-CPU Droplet with the above parameters (only after explicit approval of the recurring charge).
2. Add SSH public key authentication during creation. Do not use password-only SSH. Apply the provider firewall for TCP 22 from a trusted admin IP/VPN and TCP 80/443 for DNS validation and HTTPS. Never publicly expose Bitcoin RPC or PostgreSQL.
3. Add a dedicated test BTCPay DNS name after the Apex domain is controlled. Do not assume a hostname exists or disclose secrets in the public repo.
4. Enable weekly VM backups, plus **independent encrypted off-host BTCPay configuration and recovery backups**. A Droplet backup is not a complete wallet recovery plan.
5. Follow the official BTCPay install and independently verify `bitcoin-cli.sh getblockchaininfo` reports `regtest` before creating test invoices.
6. Do not enable mainnet or Prism-controlled payouts until separate technical, security and merchant-approval gates are complete.

Sources (prices and requirements must be rechecked at order time):
- https://www.digitalocean.com/pricing/droplets
- https://docs.digitalocean.com/products/backups/details/pricing/
- https://docs.digitalocean.com/products/droplets/details/availability/
- https://docs.btcpayserver.org/Docker/specs/

## Deferred domain and DigitalOcean handoff (2026-10-31)

Vercel's connected team domain inventory confirms `apexanabolics.co` is owned/verified and attached to the Apex storefront project. **Do not purchase a second domain.** Choose `pay-test.apexanabolics.co` as the planned test BTCPay hostname, separate from the existing storefront. The DNS A record **does not exist by virtue of this plan**; it must be created only after the VPS obtains an assigned IPv4 address. Do not change apex/root/www DNS records.

**Optional DigitalOcean browser provisioning — not executed and NOT currently requested:**
1. Sign in at `https://cloud.digitalocean.com/`, select/create an Apex-specific project and choose **Create > Droplets**.
2. Select **Ubuntu 24.04 LTS x64**, not the BTCPay Marketplace 1-Click image for this **first regtest** pass. DigitalOcean does offer a BTCPay 1-Click image, but its documented first-login wizard does not explicitly establish a regtest chain; use an independently verified `NBITCOIN_NETWORK=regtest` installation.
3. Region `NYC3` if the matching size is in stock; Basic **Regular** shared CPU; **2 vCPU / 4 GiB RAM / 80 GiB SSD**. Confirm the displayed base price (published US$24/month) before purchase.
4. Enable an SSH **public key** for admin access. Never send the SSH private key, server password or DigitalOcean API token to the public repo or chat.
5. Enable appropriate Droplet backup/monitoring options deliberately after reviewing the additional cost; do not conflate provider snapshots with full recovery of wallet/configuration state.
6. Create a DigitalOcean cloud firewall on the Droplet: inbound TCP 22 only from a trusted admin IP/VPN, TCP 80 and 443 for HTTPS and certificate issuance; default deny all other inbound application ports. No public Bitcoin RPC, PostgreSQL or Docker socket.
7. When the Droplet has a public IPv4 address, add one **DNS A record** through the existing Vercel DNS for host `pay-test` pointing to that exact IPv4 address. Only add AAAA if IPv6 exists, is supported, and correctly firewalled. Allow DNS to resolve before running the BTCPay installer.
8. Using **key-based** `ssh root@<DROPLET_IP>`, perform non-destructive OS, memory, disk, port and DNS checks before installing. Confirm the machine is dedicated and not already hosting an application or Bitcoin mainnet.
9. Run the reviewed official Docker installation profile **with `NBITCOIN_NETWORK="regtest"`**, `BTCPAYGEN_LIGHTNING="none"`, and `BTCPAY_HOST="pay-test.apexanabolics.co"` only on the verified target. The installer changes Docker, system services and potentially SSH host integration; inspect official instructions and approve host changes first.
10. Verify service health, full certificate validity (no `curl -k`), `bitcoin-cli.sh getblockchaininfo` reports `chain: regtest`, and correct administrator enrollment. Only then configure a synthetic test store and private read-only Greenfield credentials.

**Provider-specific information:** https://docs.digitalocean.com/products/marketplace/catalog/btcpay-server/ documents the 1-Click alternative, but it is not selected here. https://docs.btcpayserver.org/Docker/installation/ and https://docs.btcpayserver.org/Docker/networking/ remain authoritative for installation and HTTPS.

## Optional hosted-test operator prerequisites (only if separately approved)
1. Confirm who owns the VPS account, an acceptable monthly recurring budget, DNS name and an administrator with restricted SSH access. Do not purchase or change DNS without approval.
2. Choose a host with sufficient **persistent** storage and memory according to current BTCPay Docker/server-sizing documents. Do not use a temporary application container or Vercel for Bitcoin Core.
3. Prepare Linux updates, SSH key authentication, host firewall, monitoring and a recoverable backup method. Admin access should be IP/VPN restricted.
4. Point a DNS hostname for **test** BTCPay at the VPS IP, and allow HTTPS issuance (ports TCP 80 and 443).
5. Inspect the exact official installation instructions immediately before installing; installation modifies host Docker, system services and SSH settings.

## Hosted test Docker installation (ONLY if a temporary test VPS is separately approved)
These are adaptations of the official BTCPay Server Docker README. The placeholder DNS name must be replaced with the approved hostname. Check the current README before executing. The commands are **not executed by this repository**.

```sh
sudo su -
mkdir -p /opt/BTCPayServer
cd /opt/BTCPayServer
git clone https://github.com/btcpayserver/btcpayserver-docker
cd btcpayserver-docker
export BTCPAY_HOST="pay-test.apexanabolics.co"
export NBITCOIN_NETWORK="regtest"
export BTCPAYGEN_CRYPTO1="btc"
export BTCPAYGEN_LIGHTNING="none"
export BTCPAYGEN_REVERSEPROXY="nginx"
. ./btcpay-setup.sh -i
```

When installation returns, confirm that `https://<approved-test-host>/` presents a valid certificate (never bypass TLS validation). Securely register the **first** administrator account promptly. Confirm exact BTCPay version and read the instance's `/docs` for the permissions and API operations it actually exposes.

## Independent chain verification — mandatory
On the BTCPay VPS, run:

```sh
bitcoin-cli.sh getblockchaininfo
```

Record and independently inspect `chain: "regtest"`. Reject any other value, especially `main`. Verify Bitcoin Core and NBXplorer readiness. A Greenfield store lookup alone **cannot verify Bitcoin Core's actual network**.

## Hosted-stage read-only Greenfield connectivity preflight (not needed for first local tests)
1. Create one synthetic **regtest** store and separate test-only receiving wallet.
2. From the instance's account/API-key UI, create a dedicated, **store-scoped read-only** API key with `btcpay.store.canviewstoresettings:<STORE_ID>`; do not use an unrestricted key or payout/signing privileges. This key is for operator preflight **only**, not invoice creation.
3. Set these values in a local, private shell session, never in GitHub, a screenshot, public logs or `NEXT_PUBLIC_*` variables:

```sh
export APEX_BTCPAY_TEST_MODE="true"
export APEX_BTCPAY_TEST_NETWORK="regtest"
export APEX_BTCPAY_TEST_URL="https://pay-test.apexanabolics.co/"
export APEX_BTCPAY_TEST_STORE_ID="<store-id>"
export APEX_BTCPAY_TEST_READONLY_API_KEY="<scoped-readonly-key>"
node scripts/btcpay-readiness.mjs
```

Success only proves a valid HTTPS API response under the given key and **exact expected store ID**. It reports `remoteBitcoinNetworkVerified: false` on purpose. An authorized operator must separately verify the remote chain using `bitcoin-cli.sh`.

The first application invoice key later needs `btcpay.store.cancreateinvoice:<STORE_ID>`, stored server-side and separately from this preflight key. Do not enable it in this pass. Configure a separately secured webhook secret in the future and validate raw-body HMAC, deduplication and authenticated invoice re-fetch before updating orders.

## Prism checkpoint — perform on local regtest first, use hosted stage only if needed
1. Confirm selected BTCPay build and installed Prism plugin version are compatible.
2. Create **only test-network** supplier and platform destinations with independent signing/security boundaries.
3. Prove one test payment and actual subsequent two-destination forwarding; verify transaction IDs, on-chain confirmations, rounding, minimum outputs and network-fee payer.
4. Test delayed payout, retry, signer failure, restarts, failed/partial forwarding, duplicate events and refunds. Reconcile each recipient independently.
5. Until these tests pass, **do not activate payout rules or real customer checkout**.

## Review and acceptance
- `npm test` includes the offline read-only preflight tests.
- The readiness script uses only a Greenfield GET, never sends a payment request or database write.
- No real credentials, wallet material or addresses are included in code, tests or docs.
- No changes to production environment variables, Supabase, application routes, user permissions or public website.
- Manual operator/server checklist must be completed after an approved VPS actually exists; until then the integration status remains **NOT CONFIGURED**.

## Current references (reverify before deployment)
- Official Docker installer: https://docs.btcpayserver.org/Docker/installation/
- Official Docker installation README: https://github.com/btcpayserver/btcpayserver-docker
- Networking and HTTPS: https://docs.btcpayserver.org/Docker/networking/
- Greenfield API/auth: https://docs.btcpayserver.org/Developers/api/
- API permissions: https://docs.btcpayserver.org/BTCPayServer/greenfield-authorization/
- Prism plugin: https://plugin-builder.btcpayserver.org/public/plugins/prism
- Existing Apex test adapter: docs/BTCPAY_TEST_PROCESSOR_SPIKE.md
