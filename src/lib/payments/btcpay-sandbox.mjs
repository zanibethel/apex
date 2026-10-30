/**
 * BTCPay Greenfield proof-of-concept adapter. SERVER ONLY.
 *
 * Deliberately NOT wired to Next.js routes, checkout, orders, or payouts.
 * The caller must separately verify that the remote BTCPay instance uses the
 * requested non-mainnet Bitcoin network; the API key does not prove this.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const safeId = /^[A-Za-z0-9_-]{1,100}$/;
const supportedEvents = new Set([
  "InvoiceCreated", "InvoiceReceivedPayment", "InvoiceProcessing",
  "InvoiceExpired", "InvoiceSettled", "InvoiceInvalid", "InvoicePaymentSettled",
]);

function requireSandbox(config) {
  if (!config || config.testMode !== true ||
      !["regtest", "testnet"].includes(config.network)) {
    throw new Error("BTCPay adapter requires explicitly enabled testnet/regtest mode.");
  }
  if (typeof config.apiKey !== "string" || config.apiKey.length < 12 ||
      typeof config.storeId !== "string" || !safeId.test(config.storeId)) {
    throw new Error("Missing BTCPay test store credentials.");
  }
  let url;
  try { url = new URL(config.serverUrl); }
  catch { throw new Error("Invalid BTCPay test server URL."); }
  if (url.protocol !== "https:" || !url.hostname || url.username ||
      url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("BTCPay test server must be an HTTPS origin without credentials.");
  }
  return url;
}

export function centsToUsd(cents) {
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 100000000) {
    throw new Error("Invoice amount must be a positive, bounded integer number of cents.");
  }
  return String(Math.floor(cents / 100)) + "." + String(cents % 100).padStart(2, "0");
}

function safeInvoiceResponse(value, serverOrigin) {
  if (!value || typeof value.id !== "string" || !safeId.test(value.id) ||
      typeof value.checkoutLink !== "string") {
    throw new Error("BTCPay test invoice response was incomplete.");
  }
  let link;
  try { link = new URL(value.checkoutLink); }
  catch { throw new Error("BTCPay test checkout link was invalid."); }
  // Prevent redirecting a test checkout to an unexpected (possibly mainnet) host.
  if (link.protocol !== "https:" || link.origin !== serverOrigin) {
    throw new Error("BTCPay test checkout link did not match the test server.");
  }
  return { invoiceId: value.id, checkoutLink: link.href };
}

export async function createTestInvoice(config, {
  orderRef, amountCents, fetchImpl = fetch,
}) {
  const base = requireSandbox(config);
  if (typeof orderRef !== "string" || !safeId.test(orderRef)) {
    throw new Error("An opaque, non-personal test order reference is required.");
  }
  const amount = centsToUsd(amountCents);
  const endpoint = new URL("/api/v1/stores/" + encodeURIComponent(config.storeId) + "/invoices", base);
  const response = await fetchImpl(endpoint.href, {
    method: "POST",
    headers: {
      Authorization: "token " + config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount, currency: "USD", metadata: { orderId: orderRef },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    // Never include upstream body or credentials in thrown errors.
    throw new Error("BTCPay test invoice request failed (HTTP " + response.status + ").");
  }
  return safeInvoiceResponse(await response.json(), base.origin);
}

export function verifyBTCPayWebhook(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length > 65536 ||
      typeof secret !== "string" || secret.length < 16 ||
      typeof signature !== "string" ||
      !/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(rawBody).digest();
  const received = Buffer.from(signature.slice(7), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function parseVerifiedInvoiceEvent(rawBody, signature, secret, expectedStoreId) {
  if (!verifyBTCPayWebhook(rawBody, signature, secret)) {
    throw new Error("Invalid BTCPay webhook signature.");
  }
  let event;
  try { event = JSON.parse(rawBody.toString("utf8")); }
  catch { throw new Error("Invalid BTCPay webhook body."); }
  if (!event || !supportedEvents.has(event.type) ||
      typeof event.invoiceId !== "string" || !safeId.test(event.invoiceId) ||
      typeof event.deliveryId !== "string" || !safeId.test(event.deliveryId) ||
      typeof event.storeId !== "string" || !safeId.test(event.storeId) ||
      event.storeId !== expectedStoreId) {
    throw new Error("Unexpected BTCPay invoice event or store.");
  }
  // No order is marked paid from a webhook alone. The future worker must check
  // invoice status + additionalStatus via authenticated Greenfield GET, then
  // atomically deduplicate delivery ID and persist payment/ledger transitions.
  return {
    deliveryId: event.deliveryId,
    invoiceId: event.invoiceId,
    storeId: event.storeId,
    type: event.type,
  };
}

/**
 * Preview allocation math only: no fee deduction, payable entitlement,
 * merchant split activation, or actual payout instruction.
 * Remainder stays with platform for deterministic sub-satoshi rounding.
 */
export function previewAllocationSats(grossSats, supplierBasisPoints = 9000) {
  if ((typeof grossSats !== "bigint" &&
       !(typeof grossSats === "string" && /^\d+$/.test(grossSats))) ||
      !Number.isSafeInteger(supplierBasisPoints) ||
      supplierBasisPoints < 0 || supplierBasisPoints > 10000) {
    throw new Error("Invalid BTC amount or split basis points.");
  }
  const gross = BigInt(grossSats);
  if (gross < 0n || gross > 2100000000000000n) {
    throw new Error("BTC amount outside permitted range.");
  }
  const supplierSats = gross * BigInt(supplierBasisPoints) / 10000n;
  return {
    supplierSats,
    platformSats: gross - supplierSats,
    grossSats: gross,
  };
}
