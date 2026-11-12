import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  exactInvoiceUsdCents,
  classifyTestInvoice,
  readTestInvoice,
  inspectSignedTestInvoiceWebhook,
} from "../src/lib/payments/btcpay-invoice-reconciliation.mjs";

const config = {
  testMode: true, expectedNetwork: "regtest",
  serverUrl: "https://btcpay-test.example.invalid/",
  storeId: "test_store_A",
  apiKey: "synthetic_invoice_read_key",
};
const expected = {
  expectedInvoiceId: "TEST-INVOICE-77",
  expectedOrderRef: "TEST-ORDER-12",
  expectedAmountCents: 1005,
};
const validInvoice = {
  id: expected.expectedInvoiceId,
  storeId: config.storeId,
  currency: "USD",
  amount: "10.05",
  metadata: { orderId: expected.expectedOrderRef },
  status: "Settled",
  additionalStatus: "None",
};
const mockedRead = invoice => async (url, options) => ({
  ok: true, status: 200, json: async () => invoice,
});

test("parses exact decimal cents without floats or rounding", () => {
  for (const [amount, cents] of [
    ["10", 1000], ["10.0", 1000], ["10.05", 1005],
    ["10.05000000", 1005], ["0.01", 1],
    ["1000000.00", 100000000],
  ]) assert.equal(exactInvoiceUsdCents(amount), cents);
  for (const amount of [
    "0", "0.00", "0.001", "1.001", "1e3", "NaN", "-1",
    "10,05", "01.00", "1000000.01", "999999999.99",
    "", null, 10, "10.000000001",
  ]) assert.equal(exactInvoiceUsdCents(amount), null);
});

test("successful read stays GET-only and validates merchant, order, money and status", async () => {
  let call;
  const result = await readTestInvoice(config, {
    ...expected, fetchImpl: async (url, options) => {
      call = { url, options };
      return { ok: true, status: 200, json: async () => validInvoice };
    },
  });
  assert.equal(call.url, "https://btcpay-test.example.invalid/api/v1/invoices/TEST-INVOICE-77");
  assert.equal(call.options.method, "GET");
  assert.equal(call.options.redirect, "error");
  assert.equal(call.options.headers.Authorization, "token " + config.apiKey);
  assert.ok(call.options.signal);
  assert.deepEqual(result, {
    invoiceId: expected.expectedInvoiceId,
    orderRef: expected.expectedOrderRef,
    storeId: config.storeId,
    status: "Settled",
    additionalStatus: "None",
    assessment: "settled_invoice_reported",
    automaticallyCreditOrder: false,
    automaticallySendPayout: false,
    networkIndependentlyVerified: false,
  });
  assert.equal(Object.isFrozen(result), true);
});

test("fail closed on improper test network, invoice ID and order snapshot before fetch", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw Error("network called"); };
  for (const bad of [
    { config: { ...config, expectedNetwork: "mainnet" } },
    { config: { ...config, testMode: false } },
    { config, expected: { ...expected, expectedInvoiceId: "../other" } },
    { config, expected: { ...expected, expectedOrderRef: "" } },
    { config, expected: { ...expected, expectedAmountCents: 10.5 } },
    { config, expected: { ...expected, expectedAmountCents: 0 } },
  ]) {
    await assert.rejects(readTestInvoice(bad.config, {
      ...(bad.expected || expected), fetchImpl,
    }));
  }
  assert.equal(calls, 0);
});

test("rejects mismatched stores, invoice IDs, metadata, money and missing status", () => {
  const cases = [
    { storeId: "other_supplier_store" },
    { id: "other_invoice" },
    { metadata: { orderId: "other_order" } },
    { metadata: {} },
    { amount: "10.06" },
    { amount: "10.050001" },
    { currency: "BTC" },
    { status: "NotAStatus" },
    { additionalStatus: undefined },
    { additionalStatus: "UnrecognizedException" },
  ];
  for (const change of cases) {
    assert.throws(() => classifyTestInvoice({ ...validInvoice, ...change }, {
      ...expected, expectedStoreId: config.storeId,
    }));
  }
});

test("invoice statuses never grant automatic credit or transfers; exceptions require review", () => {
  const states = [
    ["New", "None", "awaiting"],
    ["Processing", "None", "processing"],
    ["Settled", "None", "settled_invoice_reported"],
    ["Expired", "None", "expired"],
    ["Invalid", "None", "invalid"],
    ["Settled", "Marked", "exception_manual_review"],
    ["Settled", "PaidOver", "exception_manual_review"],
    ["Expired", "PaidLate", "exception_manual_review"],
    ["New", "PaidPartial", "exception_manual_review"],
    ["Invalid", "Invalid", "exception_manual_review"],
  ];
  for (const [status, additionalStatus, assessment] of states) {
    const result = classifyTestInvoice(
      { ...validInvoice, status, additionalStatus },
      { ...expected, expectedStoreId: config.storeId },
    );
    assert.equal(result.assessment, assessment);
    assert.equal(result.automaticallyCreditOrder, false);
    assert.equal(result.automaticallySendPayout, false);
  }
});

test("read errors never include upstream bodies, transport details or payment secrets", async () => {
  await assert.rejects(readTestInvoice(config, {
    ...expected, fetchImpl: async () => ({
      ok: false, status: 403,
      text: async () => "CREDENTIALS_LEAK",
    }),
  }), e => /HTTP 403/.test(e.message) && !/CREDENTIALS/.test(e.message));
  await assert.rejects(readTestInvoice(config, {
    ...expected, fetchImpl: async () => { throw Error("Authorization: secret"); },
  }), e => /transport failed/.test(e.message) && !/secret/.test(e.message));
  await assert.rejects(readTestInvoice(config, {
    ...expected, fetchImpl: async () => ({
      ok: true, json: async () => { throw Error("sensitive payload"); },
    }),
  }), e => /invalid JSON/.test(e.message) && !/sensitive/.test(e.message));
});

test("signed webhook is only a trigger to independently read matched store/order invoice", async () => {
  const webhookSecret = "long_fake_webhook_secret_123";
  const rawBody = Buffer.from(JSON.stringify({
    type: "InvoiceSettled", storeId: config.storeId,
    invoiceId: expected.expectedInvoiceId, deliveryId: "test_delivery_18",
  }));
  const signature = "sha256=" + createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    return (await mockedRead(validInvoice)(url, options));
  };
  const result = await inspectSignedTestInvoiceWebhook(config, {
    rawBody, signature, webhookSecret, ...expected, fetchImpl,
  });
  assert.equal(calls, 1);
  assert.equal(result.deliveryId, "test_delivery_18");
  assert.equal(result.eventType, "InvoiceSettled");
  assert.equal(result.assessment, "settled_invoice_reported");
  assert.equal(result.automaticallyCreditOrder, false);

  await assert.rejects(inspectSignedTestInvoiceWebhook(config, {
    rawBody, signature: signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0"),
    webhookSecret, ...expected, fetchImpl,
  }));
  await assert.rejects(inspectSignedTestInvoiceWebhook(config, {
    rawBody, signature, webhookSecret,
    ...expected, expectedInvoiceId: "DIFFERENT-INVOICE", fetchImpl,
  }));
  assert.equal(calls, 1, "bad signature or invoice mismatch must never call Greenfield");

  await assert.rejects(inspectSignedTestInvoiceWebhook(config, {
    rawBody, signature, webhookSecret, ...expected,
    fetchImpl: async () => ({ ok: true, json: async () => ({
      ...validInvoice, storeId: "attacker_store",
    }) }),
  }));
});

test("reconciliation is not connected to a public checkout, webhook route or DB writer", () => {
  const source = readFileSync("src/lib/payments/btcpay-invoice-reconciliation.mjs", "utf8");
  assert.match(source, /method: "GET"/);
  assert.doesNotMatch(source, /method: "POST"|\bsupabase\b|payout_entries|is_published/);
  const root = readFileSync("src/app/page.tsx", "utf8");
  const catalog = readFileSync("src/app/catalog/page.tsx", "utf8");
  assert.doesNotMatch(root + catalog, /btcpay-invoice-reconciliation|btcpay-sandbox/);
});
