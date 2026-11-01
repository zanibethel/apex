# BTCPay test-server provisioning — first operator pass (2026-10-31)

**Status: PREPARED, NOT DEPLOYED.** No VPS purchased or connected, no DNS configured, no BTCPay instance, no wallet created, no Prism installation, no API credentials, no checkout, no transfers. This PR adds only a read-only preflight tool and runbook.

## Fixed scope
- Apex uses one shared storefront; supplier authorization and payout percentages remain controlled in the Apex application.
- A separate Linux VPS hosts the BTCPay Docker stack, PostgreSQL, NBXplorer and Bitcoin Core.
- First proving network: **Bitcoin regtest** with worthless coins. No mainnet and no Lightning.
- Prism **candidate only**: verify compatibility and actual payout forwarding in a later separate test pass. Do not infer direct in-transaction splitting.
- This deployment is isolated from the existing Apex Signet-only pending wallet requests; do **not** reuse them.
- No production merchant transactions or commercial activation. Any later release requires merchant/product/payment authorization.

## Operator prerequisites (still required)
1. Confirm who owns the VPS account, an acceptable monthly recurring budget, DNS name and an administrator with restricted SSH access. Do not purchase or change DNS without approval.
2. Choose a host with sufficient **persistent** storage and memory according to current BTCPay Docker/server-sizing documents. Do not use a temporary application container or Vercel for Bitcoin Core.
3. Prepare Linux updates, SSH key authentication, host firewall, monitoring and a recoverable backup method. Admin access should be IP/VPN restricted.
4. Point a DNS hostname for **test** BTCPay at the VPS IP, and allow HTTPS issuance (ports TCP 80 and 443).
5. Inspect the exact official installation instructions immediately before installing; installation modifies host Docker, system services and SSH settings.

## Official Docker test-network installation (run only on an approved, dedicated VPS)
These are adaptations of the official BTCPay Server Docker README. The placeholder DNS name must be replaced with the approved hostname. Check the current README before executing. The commands are **not executed by this repository**.

```sh
sudo su -
mkdir -p /opt/BTCPayServer
cd /opt/BTCPayServer
git clone https://github.com/btcpayserver/btcpayserver-docker
cd btcpayserver-docker
export BTCPAY_HOST="btcpay-test.example.com"
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

## Read-only Greenfield connectivity preflight
1. Create one synthetic **regtest** store and separate test-only receiving wallet.
2. From the instance's account/API-key UI, create a dedicated, **store-scoped read-only** API key with `btcpay.store.canviewstoresettings:<STORE_ID>`; do not use an unrestricted key or payout/signing privileges. This key is for operator preflight **only**, not invoice creation.
3. Set these values in a local, private shell session, never in GitHub, a screenshot, public logs or `NEXT_PUBLIC_*` variables:

```sh
export APEX_BTCPAY_TEST_MODE="true"
export APEX_BTCPAY_TEST_NETWORK="regtest"
export APEX_BTCPAY_TEST_URL="https://btcpay-test.example.com/"
export APEX_BTCPAY_TEST_STORE_ID="<store-id>"
export APEX_BTCPAY_TEST_READONLY_API_KEY="<scoped-readonly-key>"
node scripts/btcpay-readiness.mjs
```

Success only proves a valid HTTPS API response under the given key and **exact expected store ID**. It reports `remoteBitcoinNetworkVerified: false` on purpose. An authorized operator must separately verify the remote chain using `bitcoin-cli.sh`.

The first application invoice key later needs `btcpay.store.cancreateinvoice:<STORE_ID>`, stored server-side and separately from this preflight key. Do not enable it in this pass. Configure a separately secured webhook secret in the future and validate raw-body HMAC, deduplication and authenticated invoice re-fetch before updating orders.

## Prism checkpoint — separate follow-up
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
