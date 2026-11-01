import test from "node:test";
import assert from "node:assert/strict";
import {
  validateBTCPayReadinessConfig,
  checkBTCPayTestStore,
} from "../src/lib/payments/btcpay-readiness.mjs";

const baseConfig = {
  testMode: true,
  expectedNetwork: "regtest",
  serverUrl: "https://btcpay-test.example.invalid/",
  storeId: "test_store_1",
  apiKey: "read_only_fake_test_key",
};

test("BTCPay preflight rejects production/ambiguous settings before network access", async () => {
  let requests = 0;
  const fakeFetch = async () => { requests++; throw new Error("must not call"); };
  for (const changes of [
    { testMode: false },
    { expectedNetwork: "mainnet" },
    { expectedNetwork: "signet" },
    { expectedNetwork: undefined },
    { serverUrl: "http://btcpay-test.example.invalid/" },
    { serverUrl: "https://a:b@btcpay-test.example.invalid/" },
    { serverUrl: "https://btcpay-test.example.invalid/some/path" },
    { serverUrl: "https://btcpay-test.example.invalid/?key=secret" },
    { apiKey: "short" },
    { apiKey: "long key with space" },
    { storeId: "../unauthorized" },
  ]) {
    assert.throws(() => validateBTCPayReadinessConfig({ ...baseConfig, ...changes }));
    await assert.rejects(
      checkBTCPayTestStore({ ...baseConfig, ...changes }, { fetchImpl: fakeFetch }),
    );
  }
  assert.equal(requests, 0);
});

test("read-only lookup is store-scoped, uses token authorization, and does not claim chain attestation", async () => {
  let seen;
  const outcome = await checkBTCPayTestStore(baseConfig, {
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return {
        ok: true, status: 200,
        json: async () => ({ id: baseConfig.storeId, name: "Synthetic Test Store" }),
      };
    },
  });
  assert.equal(seen.url, "https://btcpay-test.example.invalid/api/v1/stores/test_store_1");
  assert.equal(seen.options.method, "GET");
  assert.equal(seen.options.redirect, "error");
  assert.equal(seen.options.headers.Authorization, "token " + baseConfig.apiKey);
  assert.ok(seen.options.signal);
  assert.deepEqual(outcome, {
    testStoreReadVerified: true,
    remoteBitcoinNetworkVerified: false,
    expectedNetwork: "regtest",
    nextRequiredCheck: "Run bitcoin-cli.sh getblockchaininfo on the BTCPay VPS and verify chain.",
  });
  assert.equal(Object.isFrozen(outcome), true);
});

test("refuses cross-store responses and never includes upstream error text", async () => {
  await assert.rejects(
    checkBTCPayTestStore(baseConfig, {
      fetchImpl: async () => ({ ok: true, json: async () => ({ id: "other_store" }) }),
    }),
    /identity did not match/,
  );
  await assert.rejects(
    checkBTCPayTestStore(baseConfig, {
      fetchImpl: async () => ({
        ok: false, status: 403,
        text: async () => "SENSITIVE_UPSTREAM_BODY",
      }),
    }),
    e => /HTTP 403/.test(e.message) && !/SENSITIVE/.test(e.message),
  );
  await assert.rejects(
    checkBTCPayTestStore(baseConfig, {
      fetchImpl: async () => ({ ok: true, json: async () => { throw Error("secret"); } }),
    }),
    e => /invalid JSON/.test(e.message) && !/secret/.test(e.message),
  );
});

test("testnet store read is supported but remote network remains unverified", async () => {
  const outcome = await checkBTCPayTestStore(
    { ...baseConfig, expectedNetwork: "testnet" },
    { fetchImpl: async () => ({
      ok: true, json: async () => ({ id: baseConfig.storeId }),
    }) },
  );
  assert.equal(outcome.expectedNetwork, "testnet");
  assert.equal(outcome.remoteBitcoinNetworkVerified, false);
});
