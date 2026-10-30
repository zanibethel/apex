# Apex — isolated Bitcoin regtest transfer experiment

**Scope:** Internal test using **worthless Bitcoin regtest coins**. This does not create a BTCPay invoice, install the Prism plugin, run the application checkout, create an order, or move real funds. It does not connect to the Apex Supabase project or Vercel.

## Why this exists
Before paying for a VPS, prove we can reliably run a local, isolated Bitcoin blockchain and demonstrate that one simulated customer payment can be followed by a two-recipient 90/10 transfer. This validates simple Bitcoin Core mechanics and integer math, **not** the live commercial payment architecture or Prism payout forwarding.

## Local requirements
- Docker Engine / Docker Desktop with Compose v2 (Windows users can use Docker Desktop + WSL2).
- Node.js 22+ to execute the smoke script.
- Enough disk/memory to run a small Bitcoin Core regtest container.
- Run the commands at the Apex repository root.
- No Supabase, Vercel, BTCPay, Prism, payment account, private address, or API key required.

## Run on your own machine

```bash
docker compose -p apex-regtest -f infra/regtest/compose.yml up -d --wait
node scripts/regtest-smoke.mjs
docker compose -p apex-regtest -f infra/regtest/compose.yml down --volumes --remove-orphans
```

The final command **permanently deletes these disposable local test wallets and chain data**; never keep private keys, customer funds, or any information of value in this environment. If you want to rerun using existing data, use the smoke script again before the cleanup command.

## Script behavior and assertions
1. Uses `docker compose exec` to contact Bitcoin Core **within its container**, with cookie authentication (no RPC port on host).
2. Fails closed if the remote node reports anything besides the literal `regtest` chain.
3. Creates new wallets for a synthetic customer, merchant, supplier, and platform; generates test-chain blocks and spendable coins.
4. Transfers 0.02000000 regtest BTC to the customer and a separate 0.00200000 fee reserve to the merchant; mines one confirming block.
5. Simulates one customer payment of 0.01000000 BTC to a new merchant invoice address. Verifies it was confirmed.
6. Splits that payment into exactly 0.00900000 BTC (supplier) and 0.00100000 BTC (platform), using a two-output Bitcoin transaction. The merchant's **separate fee reserve** covers blockchain fees.
7. Mines a block and validates the two outputs and recipient wallet confirmations. Emits BTC network, exact sats and test-only transaction IDs.
8. The GitHub Actions regtest workflow repeats this on an isolated ephemeral runner and destroys its test wallets/chain afterward.

**This smoke test does not call BTCPay Greenfield at all.** PR #30's mocked Greenfield test adapter remains separate. The next integration gate is a real BTCPay Server test instance connected to a regtest node and actual invoice lifecycle, followed by an independent Prism plugin end-to-end forwarding/fee reconciliation test.

## Safety boundaries
- The Compose file chooses the fixed **bitcoin/bitcoin:28.0** community-built test image (not an officially endorsed Bitcoin Core production binary). Never use it for real funds. Inspect the image/source before local use.
- `regtest=1`, no published ports, no external listening and an internal Docker network are set deliberately. Do not edit this to enable mainnet.
- Data persists in the named `apex-regtest_regtest_chain` Docker volume until the teardown command.
- No production secrets or wallet keys should be entered into the containers, code, or CI.
- Earlier Apex Signet wallet-request addresses are **not** regtest addresses. Do not use them in this experiment.
- The scenario assumes the merchant pays the miner fee from a separate reserve. Network fees, refund obligations, rounding and the legal commission basis need explicit partner agreement before any real payout processing.

## Acceptance criteria
- Static/unit tests and normal Apex CI pass.
- Regtest CI job passes a **real Bitcoin Core** block-mining and two-output transfer.
- No mainnet network, public RPC, production secrets, real orders, commercial checkout or outgoing production transaction is used.
- PR stays in review until accepted. Next PR would address BTCPay itself, not activate storefront checkout.

## References
- https://docs.btcpayserver.org/Docker/configuration/
- https://docs.btcpayserver.org/Developers/api/
- https://hub.docker.com/r/bitcoin/bitcoin
- docs/BTCPAY_TEST_PROCESSOR_SPIKE.md
