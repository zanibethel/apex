/**
 * BTCPay regtest/testnet invoice verification foundation — SERVER ONLY.
 *
 * Only a read-only Greenfield GET. Does not write to Supabase, change orders,
 * credit accounts, publish products, initiate payouts, or expose API routes.
 *
 * Requires an explicit non-mainnet test config and an API key authorized
 * for btcpay.store.canviewinvoices:<STORE_ID>.
 */
import { validateBTCPayReadinessConfig } from "./btcpay-readiness.mjs";
import { parseVerifiedInvoiceEvent } from "./btcpay-sandbox.mjs";

const safeId = /^[A-Za-z0-9_-]{1,100}$/;
const statuses = new Set(["New", "Processing", "Settled", "Expired", "Invalid"]);
const additionalStatuses = new Set([
  "None", "PaidPartial", "PaidOver", "PaidLate", "Marked", "Invalid",
]);

export function exactInvoiceUsdCents(amount) {
  // BTCPay returns decimal strings. Reject fractions of a US cent rather than
  // silently rounding them; handle trailing zeros without floating point.
  if (typeof amount !== "string") return null;
  const match = /^(0|[1-9]\d{0,8})(?:\.(\d{1,8}))?$/.exec(amount);
  if (!match) return null;
  const fraction = (match[2] || "").padEnd(2, "0");
  if (/[1-9]/.test(fraction.slice(2))) return null;
  const cents = BigInt(match[1]) * 100n + BigInt(fraction.slice(0, 2));
  return cents >= 1n && cents <= 100000000n ? Number(cents) : null;
}

export function classifyTestInvoice(invoice, {
  expectedInvoiceId, expectedStoreId, expectedOrderRef, expectedAmountCents,
}) {
  if (![expectedInvoiceId, expectedStoreId, expectedOrderRef].every(
    id => typeof id === "string" && safeId.test(id),
  ) || !Number.isSafeInteger(expectedAmountCents) ||
      expectedAmountCents < 1 || expectedAmountCents > 100000000) {
    throw new Error("A trusted test order and amount snapshot are required.");
  }
  if (!invoice || typeof invoice !== "object" ||
      invoice.id !== expectedInvoiceId || invoice.storeId !== expectedStoreId ||
      !invoice.metadata || invoice.metadata.orderId !== expectedOrderRef) {
    throw new Error("BTCPay invoice identity or order metadata did not match.");
  }
  if (invoice.currency !== "USD" ||
      exactInvoiceUsdCents(invoice.amount) !== expectedAmountCents) {
    throw new Error("BTCPay invoice currency or amount did not match trusted order.");
  }
  if (!statuses.has(invoice.status) ||
      !additionalStatuses.has(invoice.additionalStatus)) {
    throw new Error("BTCPay invoice status was missing or unrecognized.");
  }

  let assessment;
  if (invoice.additionalStatus !== "None") {
    // PaidOver, PaidLate, PaidPartial, Marked and Invalid are not clean payments.
    assessment = "exception_manual_review";
  } else {
    assessment = {
      New: "awaiting",
      Processing: "processing",
      Settled: "settled_invoice_reported",
      Expired: "expired",
      Invalid: "invalid",
    }[invoice.status];
  }

  return Object.freeze({
    invoiceId: expectedInvoiceId,
    orderRef: expectedOrderRef,
    storeId: expectedStoreId,
    status: invoice.status,
    additionalStatus: invoice.additionalStatus,
    assessment,
    // A BTCPay status read is not a persisted order, on-chain proof, or a
    // legal merchant approval. No automatic order/payout state transitions.
    automaticallyCreditOrder: false,
    automaticallySendPayout: false,
    networkIndependentlyVerified: false,
  });
}

export async function readTestInvoice(config, {
  expectedInvoiceId, expectedOrderRef, expectedAmountCents,
  fetchImpl = fetch,
}) {
  const base = validateBTCPayReadinessConfig(config);
  if (typeof expectedInvoiceId !== "string" || !safeId.test(expectedInvoiceId)) {
    throw new Error("A trusted BTCPay test invoice ID is required.");
  }
  // Ensure malformed amount/order is rejected before making any request.
  if (typeof expectedOrderRef !== "string" || !safeId.test(expectedOrderRef) ||
      !Number.isSafeInteger(expectedAmountCents) ||
      expectedAmountCents < 1 || expectedAmountCents > 100000000) {
    throw new Error("A trusted test order and amount snapshot are required.");
  }
  const url = new URL("/api/v1/invoices/" + encodeURIComponent(expectedInvoiceId), base);
  let response;
  try {
    response = await fetchImpl(url.href, {
      method: "GET",
      headers: {
        Authorization: "token " + config.apiKey,
        Accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("BTCPay test invoice read transport failed.");
  }
  if (!response || response.ok !== true) {
    const status = Number.isSafeInteger(response?.status) ? response.status : 0;
    throw new Error("BTCPay test invoice read failed (HTTP " + status + ").");
  }
  let invoice;
  try { invoice = await response.json(); }
  catch { throw new Error("BTCPay test invoice returned invalid JSON."); }
  return classifyTestInvoice(invoice, {
    expectedInvoiceId, expectedStoreId: config.storeId,
    expectedOrderRef, expectedAmountCents,
  });
}

export async function inspectSignedTestInvoiceWebhook(config, {
  rawBody, signature, webhookSecret, expectedInvoiceId,
  expectedOrderRef, expectedAmountCents, fetchImpl = fetch,
}) {
  // Verify network/test credentials before any remote request.
  validateBTCPayReadinessConfig(config);
  const event = parseVerifiedInvoiceEvent(
    rawBody, signature, webhookSecret, config.storeId,
  );
  if (event.invoiceId !== expectedInvoiceId) {
    throw new Error("Signed BTCPay event did not match the expected invoice.");
  }
  const assessment = await readTestInvoice(config, {
    expectedInvoiceId, expectedOrderRef, expectedAmountCents, fetchImpl,
  });
  // Delivery ID returned for future idempotent persistence, NOT deduplicated
  // here; no webhook API route or database writer is installed in this pass.
  return Object.freeze({
    deliveryId: event.deliveryId,
    eventType: event.type,
    ...assessment,
  });
}
