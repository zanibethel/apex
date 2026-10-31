#!/usr/bin/env node
/**
 * Apex local-only Bitcoin Core REGTEST smoke test.
 * This is a two-output transfer using worthless regtest coins, NOT
 * BTCPay/Prism settlement and NOT a live checkout integration.
 *
 * Requirements: Docker + Docker Compose, local regtest node from
 * infra/regtest/compose.yml running. Uses only docker compose exec.
 * No network ports, real wallet addresses, secrets or private keys.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { previewAllocationSats } from "../src/lib/payments/btcpay-sandbox.mjs";

const compose = ["compose", "-p", "apex-regtest",
  "-f", "infra/regtest/compose.yml", "exec", "-T", "node",
  "bitcoin-cli", "-datadir=/home/bitcoin/.bitcoin", "-regtest"];

export function btcToSats(value) {
  const text = String(value);
  if (!/^\d+(?:\.\d{1,8})?$/.test(text)) {
    throw new Error("Expected a non-negative decimal BTC amount.");
  }
  const [whole, fractional = ""] = text.split(".");
  return BigInt(whole) * 100000000n + BigInt(fractional.padEnd(8, "0"));
}

export function satsToBtc(value) {
  if (typeof value !== "bigint" || value < 0n || value > 2100000000000000n) {
    throw new Error("Invalid integer-satoshi amount.");
  }
  return (value / 100000000n).toString() + "." +
    (value % 100000000n).toString().padStart(8, "0");
}

function cli(...args) {
  const output = execFileSync("docker", [...compose, ...args.map(String)], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 45000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  try { return JSON.parse(output); } catch { return output; }
}

function rpc(method, ...args) {
  return cli(method, ...args);
}

function wallet(name, method, ...args) {
  return cli("-rpcwallet=" + name, method, ...args);
}

function ensureWallet(name) {
  const loaded = rpc("listwallets");
  if (loaded.includes(name)) return;
  const existing = rpc("listwalletdir").wallets.some(w => w.name === name);
  if (existing) rpc("loadwallet", name);
  else rpc("createwallet", name);
}

function assertRegtestChain() {
  const chain = rpc("getblockchaininfo");
  assert.equal(chain.chain, "regtest",
    "STOP: connected node is not Bitcoin regtest");
  return chain;
}

function mine(address, blocks) {
  assert.ok(Number.isInteger(blocks) && blocks > 0 && blocks <= 101);
  rpc("generatetoaddress", blocks, address);
}

export async function runRegtestSmoke() {
  // No funds, wallets, or transactions are touched until chain identity is verified.
  const chain = assertRegtestChain();
  const suffix = randomBytes(5).toString("hex");
  const miner = "apex_miner";
  const customer = "apex_customer_" + suffix;
  const merchant = "apex_merchant_" + suffix;
  const supplier = "apex_supplier_" + suffix;
  const platform = "apex_platform_" + suffix;
  for (const name of [miner, customer, merchant, supplier, platform]) ensureWallet(name);

  const miningAddress = wallet(miner, "getnewaddress", "", "bech32");
  // Each run matures at least one new coinbase output; independent of prior tests.
  mine(miningAddress, 101);

  const customerAddress = wallet(customer, "getnewaddress", "", "bech32");
  const feeReserveAddress = wallet(merchant, "getnewaddress", "", "bech32");
  const invoiceAddress = wallet(merchant, "getnewaddress", "", "bech32");
  const supplierAddress = wallet(supplier, "getnewaddress", "", "bech32");
  const platformAddress = wallet(platform, "getnewaddress", "", "bech32");

  for (const address of [customerAddress, feeReserveAddress, invoiceAddress,
    supplierAddress, platformAddress]) {
    assert.ok(address.startsWith("bcrt1"),
      "STOP: wallet generated a non-regtest address");
  }

  const invoiceSats = 1000000n; // 0.01000000 BTC, worthless regtest funds
  const feeReserveSats = 200000n; // merchant pays network fees independently
  const {supplierSats, platformSats} = previewAllocationSats(invoiceSats, 9000);
  assert.equal(supplierSats + platformSats, invoiceSats);

  // Fund an isolated synthetic customer and merchant fee reserve.
  wallet(miner, "sendtoaddress", customerAddress, satsToBtc(2000000n));
  wallet(miner, "sendtoaddress", feeReserveAddress, satsToBtc(feeReserveSats));
  mine(miningAddress, 1);

  // Synthetic customer pays a single merchant invoice address.
  const incomingTxid = wallet(customer, "sendtoaddress",
    invoiceAddress, satsToBtc(invoiceSats));
  mine(miningAddress, 1);
  assert.equal(btcToSats(wallet(merchant, "getreceivedbyaddress", invoiceAddress, 1)),
    invoiceSats, "Customer payment amount not confirmed");

  // Simulates a TWO-OUTPUT transfer; it does not install or exercise Prism.
  // Fee comes from merchant fee reserve, NOT from either 90/10 recipient amount.
  const outputAmounts = {
    [supplierAddress]: Number(satsToBtc(supplierSats)),
    [platformAddress]: Number(satsToBtc(platformSats)),
  };
  const splitTxid = wallet(merchant, "sendmany", "",
    JSON.stringify(outputAmounts), 1, "apex-regtest-90-10");
  mine(miningAddress, 1);

  const transaction = rpc("getrawtransaction", splitTxid, true);
  const outputs = new Map(transaction.vout
    .filter(o => o.scriptPubKey && o.scriptPubKey.address)
    .map(o => [o.scriptPubKey.address, btcToSats(o.value)]));
  assert.equal(outputs.get(supplierAddress), supplierSats,
    "Supplier output mismatch");
  assert.equal(outputs.get(platformAddress), platformSats,
    "Platform output mismatch");

  assert.equal(btcToSats(wallet(supplier, "getreceivedbyaddress", supplierAddress, 1)),
    supplierSats);
  assert.equal(btcToSats(wallet(platform, "getreceivedbyaddress", platformAddress, 1)),
    platformSats);
  const fee = wallet(merchant, "gettransaction", splitTxid).fee;
  assert.ok(typeof fee === "number" && fee < 0,
    "Merchant outgoing transfer should pay a network fee");
  const feeSats = btcToSats(Math.abs(fee));
  assert.ok(feeSats > 0n && feeSats < feeReserveSats,
    "Network fee was outside isolated merchant reserve");

  // Only safe aggregate facts go to CI logs; avoid persisting addresses.
  console.log(JSON.stringify({
    network: chain.chain,
    test: "synthetic-payment-two-output-transfer",
    btcpayInvoice: false,
    prismPluginTested: false,
    incomingConfirmed: true,
    payoutConfirmed: true,
    invoiceSats: String(invoiceSats),
    supplierSats: String(supplierSats),
    platformSats: String(platformSats),
    networkFeeSats: String(feeSats),
    invoiceTransactionId: incomingTxid,
    outputTransactionId: splitTxid,
  }, null, 2));
}

if (process.argv[1]?.endsWith("regtest-smoke.mjs")) {
  runRegtestSmoke().catch(err => {
    console.error("REGTEST SMOKE FAILED:", err.message);
    process.exitCode = 1;
  });
}
