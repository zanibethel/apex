import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  centsToUsd, createTestInvoice, verifyBTCPayWebhook,
  parseVerifiedInvoiceEvent, previewAllocationSats,
} from "../src/lib/payments/btcpay-sandbox.mjs";

const config = {
  testMode: true, network: "regtest",
  serverUrl: "https://payments-test.example.invalid/",
  apiKey: "test_key_not_a_real_secret",
  storeId: "test_store_1",
};

test("amounts stay integer cents and render exact fixed-decimal USD", () => {
  assert.equal(centsToUsd(1), "0.01");
  assert.equal(centsToUsd(12005), "120.05");
  for (const invalid of [0, -1, 1.1, Number.MAX_SAFE_INTEGER, Infinity, "120"]) {
    assert.throws(() => centsToUsd(invalid));
  }
});

test("no mainnet, unspecified, or disabled invoice requests are possible", async () => {
  let called = false;
  const fakeFetch = async () => { called = true; throw new Error("Should not call"); };
  for (const changes of [
    { testMode: false }, { network: "mainnet" }, { network: "signet" },
    { serverUrl: "http://payments.example.invalid/" },
    { serverUrl: "https://name:password@payments.example.invalid/" },
    { storeId: "../mainnet" },
  ]) {
    await assert.rejects(createTestInvoice({ ...config, ...changes }, {
      orderRef: "ORDER-1", amountCents: 100, fetchImpl: fakeFetch,
    }));
  }
  assert.equal(called, false);
});

test("test invoice only submits trusted cents and opaque reference to scoped API", async () => {
  let request;
  const result = await createTestInvoice(config, {
    orderRef: "TEST-ORDER-001", amountCents: 1050,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true, status: 200,
        json: async () => ({
          id: "invoice_123", checkoutLink: "https://payments-test.example.invalid/i/invoice_123",
        }),
      };
    },
  });
  assert.deepEqual(result, {
    invoiceId: "invoice_123",
    checkoutLink: "https://payments-test.example.invalid/i/invoice_123",
  });
  assert.equal(request.url, "https://payments-test.example.invalid/api/v1/stores/test_store_1/invoices");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "token " + config.apiKey);
  assert.deepEqual(JSON.parse(request.options.body), {
    amount: "10.50", currency: "USD", metadata: { orderId: "TEST-ORDER-001" },
  });
  assert.ok(request.options.signal);
});

test("upstream failure does not include a potentially sensitive body", async () => {
  await assert.rejects(
    createTestInvoice(config, {
      orderRef: "TEST-1", amountCents: 100,
      fetchImpl: async () => ({
        ok: false, status: 403, text: async () => "SECRET_RESPONSE_BODY",
      }),
    }),
    e => e.message.includes("HTTP 403") && !e.message.includes("SECRET"),
  );
});

test("checkout redirect must remain on the verified test-server origin", async () => {
  for (const link of [
    "http://payments-test.example.invalid/i/1",
    "https://mainnet.example.invalid/i/1",
    "javascript:alert(1)",
  ]) {
    await assert.rejects(createTestInvoice(config, {
      orderRef: "TEST-1", amountCents: 100,
      fetchImpl: async () => ({
        ok: true, json: async () => ({ id: "invoice_1", checkoutLink: link }),
      }),
    }));
  }
});

test("webhook HMAC uses raw bytes and rejects tampering and malformed signatures", () => {
  const secret = "a-test-secret-1234567890";
  const raw = Buffer.from('{"type":"InvoiceSettled","storeId":"store1","invoiceId":"inv1","deliveryId":"del1"}');
  const sig = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifyBTCPayWebhook(raw, sig, secret), true);
  assert.equal(verifyBTCPayWebhook(Buffer.from(raw.toString() + " "), sig, secret), false);
  assert.equal(verifyBTCPayWebhook(raw, sig.toUpperCase(), secret), false);
  assert.equal(verifyBTCPayWebhook(raw.toString(), sig, secret), false);
  assert.equal(verifyBTCPayWebhook(raw, sig, "wrong-test-secret-123456"), false);
  assert.deepEqual(parseVerifiedInvoiceEvent(raw, sig, secret, "store1"), {
    deliveryId: "del1", invoiceId: "inv1", storeId: "store1", type: "InvoiceSettled",
  });
  assert.throws(() => parseVerifiedInvoiceEvent(raw, sig, secret, "different-store"));
});

test("invalid event types are rejected even with a valid signature", () => {
  const raw = Buffer.from('{"type":"PayoutApproved","storeId":"store1","invoiceId":"inv1","deliveryId":"del1"}');
  const secret = "a-test-secret-1234567890";
  const sig = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  assert.throws(() => parseVerifiedInvoiceEvent(raw, sig, secret, "store1"));
});

test("sat allocation uses BigInt, conserves the total and rounds deterministically", () => {
  assert.deepEqual(previewAllocationSats("900001"), {
    grossSats: 900001n, supplierSats: 810000n, platformSats: 90001n,
  });
  assert.deepEqual(previewAllocationSats(1n), {
    grossSats: 1n, supplierSats: 0n, platformSats: 1n,
  });
  const split = previewAllocationSats(2100000000000000n, 10000);
  assert.equal(split.platformSats, 0n);
  assert.equal(split.supplierSats + split.platformSats, split.grossSats);
  for (const invalid of [0.1, "-5", -1n, 2100000000000001n]) {
    assert.throws(() => previewAllocationSats(invalid));
  }
  for (const bps of [-1, 10001, 50.5]) {
    assert.throws(() => previewAllocationSats(100n, bps));
  }
});

test("payment proof-of-concept is not imported into any live checkout route", () => {
  const read = path => readFileSync(path, "utf8");
  assert.match(read("src/lib/payments/btcpay-sandbox.mjs"), /testMode !== true/);
  assert.match(read("src/lib/payments/btcpay-sandbox.mjs"), /timingSafeEqual/);
  for(const path of ["src/app/page.tsx","src/app/catalog/page.tsx"]){
    const navigation=read(path).replaceAll('href="/checkout/preview"',"");
    assert.doesNotMatch(navigation,/btcpay-sandbox|href="\/checkout(?:\/|")/);
    assert.match(read(path),/href="\/checkout\/preview"/);
  }
  assert.doesNotMatch(read("src/app/checkout/preview/checkout-preview.tsx"),/btcpay-sandbox|\/api\/v1\/stores\/|\.insert\(/);
  assert.doesNotMatch(read("src/app/supplier/operations/actions.ts"), /btcpay-sandbox/);
});
