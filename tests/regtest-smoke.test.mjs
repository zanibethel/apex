import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { btcToSats, satsToBtc } from "../scripts/regtest-smoke.mjs";

test("Bitcoin amount utilities use precise, reversible integer satoshis", () => {
  for (const sats of [0n, 1n, 25n, 100000n, 1000000n,
    900000n, 2100000000000000n]) {
    assert.equal(btcToSats(satsToBtc(sats)), sats);
  }
  assert.equal(btcToSats("0.00000001"), 1n);
  assert.equal(btcToSats(1.2), 120000000n);
  for (const bad of [-1, "0.000000001", "NaN", "2e-8", "1.2oops", ""]) {
    assert.throws(() => btcToSats(bad));
  }
  for (const bad of [1, -1n, 2100000000000001n]) {
    assert.throws(() => satsToBtc(bad));
  }
});

test("regtest workflow never exposes RPC ports or invokes mainnet payout services", () => {
  const compose = readFileSync("infra/regtest/compose.yml", "utf8");
  const smoke = readFileSync("scripts/regtest-smoke.mjs", "utf8");
  const workflow = readFileSync(".github/workflows/regtest.yml", "utf8");
  assert.match(compose, /-regtest=1/);
  assert.match(compose, /internal: true/);
  assert.doesNotMatch(compose, /^\s*ports:/m);
  assert.doesNotMatch(compose, /-rpcuser|-rpcpassword|BTC[_-]PAY_API_KEY/i);
  assert.match(smoke, /assert\.equal\(chain\.chain, "regtest"/);
  assert.match(smoke, /bcrt1/);
  assert.match(smoke, /invoiceSats/);
  assert.match(smoke, /supplierSats/);
  assert.match(smoke, /platformSats/);
  assert.match(workflow, /docker compose/);
  assert.doesNotMatch(workflow, /production|mainnet|walletsecret/i);
});
