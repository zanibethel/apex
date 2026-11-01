# Apex BTCPay local-first payment validation plan (2026-10-31)

**Decision: ONE continuously paid BTCPay production VPS at launch, not TWO.** Initial Bitcoin/BTCPay/Prism testing is performed locally with worthless regtest funds. This supersedes any prior immediate instruction to create a separate permanently billed DigitalOcean test Droplet or to configure `pay-test.apexanabolics.co`.

## Cost and environment boundaries

| Purpose | Environment | Expected extra VPS cost | Current status |
| --- | --- | ---: | --- |
| Bitcoin Core two-output transfer, allocation math | Existing `infra/regtest/` Docker stack | $0 | Test code exists, CI smoke tested; not BTCPay |
| **Real BTCPay invoice and webhook integration, Prism feasibility** | Official BTCPay source/dev stack on an authorized local computer, completely separate regtest chain and wallets | $0 | Setup instructions/preflight prepared; no local BTCPay instance verified |
| Optional internet-reachable integration rehearsal | Short-lived throwaway VPS only if local tests cannot cover an essential scenario; destroy it after test and confirm billing stopped | Only if specifically approved | Not needed/authorized now |
| Actual production processing | **One dedicated, continuously running DigitalOcean BTCPay VPS**, new mainnet installation, distinct accounts/wallets, explicit approvals and secured keys | Approximately $24/month base plus backups/options after price validation | Deferred; not provisioned |

**No DigitalOcean resources, test DNS records, BTCPay wallets or secrets were created as part of this plan.** A stopped DigitalOcean Droplet still incurs charges; only deletion ends compute billing. Never place a production wallet on local development infrastructure or convert a regtest wallet to mainnet.

## Phase A — run the existing standalone Bitcoin regtest experiment

From the **Apex** repository root on the local developer machine:

```sh
docker compose -p apex-regtest -f infra/regtest/compose.yml up -d --wait
node scripts/regtest-smoke.mjs
docker compose -p apex-regtest -f infra/regtest/compose.yml down
```

This uses worthless coins and demonstrates a 90/10 **ordinary Bitcoin two-output transaction**, with merchant fee reserve. It does not create BTCPay invoices or execute Prism. The final command stops the standalone experiment and **retains** its disposable test wallet volume; deleting volumes must be an explicitly chosen cleanup.

## Phase B — official local BTCPay Server development stack

The upstream BTCPay project documents its local development path: Docker Compose for Bitcoin Core/NBXplorer/PostgreSQL and supporting test services, plus .NET SDK **10** for the server. This is separate from Apex's standalone `infra/regtest` chain. **Do not attempt to send regtest coins from the Apex standalone chain to the BTCPay dev chain**; their block histories differ even though both report `regtest`.

On the intended local computer (not in Vercel or the paid VPS):

1. Install Docker Desktop/Engine with **Compose v2**, Git and the **.NET SDK matching upstream `Build/Common.csproj` (currently .NET 10)**. Allow adequate RAM/disk; the official upstream `dev` target starts other test dependencies too (including local Lightning test services), but Apex's commercial MVP remains Bitcoin on-chain only.
2. Clone the official BTCPay source into a separate directory. Record/review the exact upstream commit/version tested; do not copy the repository's local test RPC passwords or fixture configuration into Apex.
3. Run Apex's **read-only** doctor **before starting** anything. It validates Docker Compose v2, .NET version, Bitcoin Core/NBXplorer regtest, HTTPS local launch settings and published port binds. It **does not verify the actually running blockchain**.

```sh
git clone https://github.com/btcpayserver/btcpayserver.git "$HOME/btcpayserver"
# From the Apex repo root:
node scripts/btcpay-local-doctor.mjs "$HOME/btcpayserver"
```

4. If the doctor passes, start upstream local dev dependencies from the **BTCPay source directory**, not Apex:

```sh
cd "$HOME/btcpayserver/BTCPayServer.Tests"
docker compose up -d dev
cd ..
dotnet dev-certs https --trust
dotnet run --project BTCPayServer/BTCPayServer.csproj --launch-profile Bitcoin-HTTPS
```

The .NET process may occupy the shell until you stop it. Open the upstream local HTTPS address **only after the development TLS certificate is trusted and the browser verifies it**. Never ignore certificate validation. First admin registration is local-development-only; keep the instance bound to localhost with no public proxy.

5. Independently inspect the local Bitcoin Core chain with an authenticated Bitcoin Core RPC command inside **the upstream `bitcoind` container**, and confirm `getblockchaininfo.chain == "regtest"` before generating test invoices. Do not use the earlier Apex standalone Bitcoin node as evidence for the BTCPay dev node. Check NBXplorer synchronization/health, and verify actual exposed-port bindings (`docker compose ps`). The doctor checks configuration, not the running host's firewall or connections.
6. Create a synthetic test store, test wallet and narrowly store-scoped Greenfield keys; never enter a mnemonic, real Bitcoin address or merchant production API key in the dev setup. If available, install a compatible Prism version through BTCPay's **Plugins > Plugin Directory**, then restart BTCPay as instructed; its installation/forwarding remain unverified until independently tested.
7. Prove one *actual local* Greenfield invoice, synthetic payment, signed webhook, authenticated invoice re-fetch, expected order/amount comparison, duplicate/replayed webhook behavior, and separate Prism forwarding to two regtest destinations. Record exact provider/version and safety findings in a later reviewable PR, with secrets and wallet details redacted.
8. Stop the local .NET process and, from `BTCPayServer.Tests`, run `docker compose down` to stop local dependencies. **Do not use `--volumes` unless you explicitly want to destroy disposable local fixture data.**

### If the local doctor fails
Stop. Do not modify the official Compose profile to remove its port-safety checks, use `BTCPAY_NETWORK=mainnet`, expose Bitcoin RPC/Postgres to the internet, or disable TLS validation. Determine which upstream revision changed the configuration and review that change. The upstream project can change over time; adapt tested commands via a separate review.

### What is and is not tested by current Apex CI
- Existing `scripts/regtest-smoke.mjs`: real disposable Bitcoin Core regtest test and split transaction.
- `scripts/btcpay-local-doctor.mjs`: **configuration-only**, tested with synthetic Compose and launch settings in Apex CI. It does not clone, download, install, run or verify a live BTCPay Server.
- `src/lib/payments/btcpay-sandbox.mjs`: mocked Greenfield invoice/HMAC proof of concept.
- PR #106: read-only invoice reconciliation with mocked provider replies.
- PR #107: proposed immutable test receipt journal validated in disposable PostgreSQL.
- Actual BTCPay + Prism on the local machine: **NOT YET INSTALLED OR VERIFIED**.

## Future production cutover (separate approval)
Only after local integration succeeds and the business/legal/payment gates are satisfied:
1. Obtain explicit approval for **one** DigitalOcean production VPS and any backup spend. Confirm its specs support the selected Bitcoin Core pruning/synchronization/storage growth.
2. Use a fresh dedicated Linux BTCPay installation configured for the actual approved production network. Never carry over dev wallet material, fixture credentials or test SQL.
3. Use separate production HTTPS hostname, secrets, keys, admin roles, monitoring and off-host recovery policies; validate exact GitHub and Vercel deploy gates.
4. Repeat an end-to-end controlled validation with production-safe funds only if separately approved; never assume a green local regtest test proves production settlement or commercial eligibility.

## Authoritative references
- Official BTCPay upstream local development: https://github.com/btcpayserver/btcpayserver/blob/master/docs/maintainers/local-development.md
- Official source launch settings: https://github.com/btcpayserver/btcpayserver/blob/master/BTCPayServer/Properties/launchSettings.json
- BTCPay plugins: https://docs.btcpayserver.org/Plugins/
- BTCPay deployment: https://docs.btcpayserver.org/Docker/installation/
- Existing Apex standalone smoke: docs/LOCAL_BITCOIN_REGTEST.md
- **Deferred** DigitalOcean provisioning reference: docs/BTCPAY_TEST_SERVER_PROVISIONING_20261031.md
