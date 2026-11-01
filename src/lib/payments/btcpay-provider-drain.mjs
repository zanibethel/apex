/**
 * PR #121: READ-ONLY, LOOPBACK-ONLY BTCPay Greenfield inventory and
 * non-authorizing provider/ledger reconciliation for disposable regtest.
 *
 * No checkout, invoice creation, Prism settings writes, payouts, or
 * production server access. Never use these results as permission to pay
 * or to release the PR #120 checkout hold.
 */
import { btcAmountToSats } from "./prism-payout-reliability.mjs";

const safeId = /^[A-Za-z0-9_-]{1,100}$/;
const validInvoiceStatus = new Set(["New", "Processing", "Settled", "Expired", "Invalid"]);
const validPayoutState = new Set([
  "AwaitingApproval", "AwaitingPayment", "InProgress", "Completed", "Cancelled"
]);

function requireRegtestOrigin(config) {
  if (!config || config.testOnly !== true || config.network !== "regtest" ||
      !safeId.test(config.storeId || "") ||
      typeof config.apiKey !== "string" || config.apiKey.length < 12) {
    throw Error("Read-only Greenfield probe requires explicit regtest fixture credentials");
  }
  let base;
  try { base = new URL(config.serverUrl); }
  catch { throw Error("Invalid Greenfield test origin"); }
  // Only an ephemeral locally managed BTCPay test fixture can be queried.
  // This restriction is independent of the caller's claimed network.
  if (!["http:", "https:"].includes(base.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
      base.username || base.password || base.pathname !== "/" ||
      base.search || base.hash) {
    throw Error("Greenfield provider inventory is restricted to loopback-only regtest");
  }
  return base;
}

async function requestArray(base, path, apiKey, fetchImpl) {
  const url = new URL(path, base);
  let response;
  try {
    response = await fetchImpl(url.href, {
      method: "GET",
      headers: { Authorization: "token " + apiKey, Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw Error("Greenfield read-only inventory unavailable; retain hold");
  }
  if (!response?.ok) {
    // Never echo provider response bodies or authentication information.
    throw Error("Greenfield inventory HTTP error; retain hold");
  }
  let data;
  try { data = await response.json(); }
  catch { throw Error("Malformed Greenfield JSON; retain hold"); }
  if (!Array.isArray(data)) {
    throw Error("Unexpected Greenfield inventory shape; retain hold");
  }
  return data;
}

/**
 * Greenfield documented read endpoints: GET /stores/{id}/invoices, and
 * GET /stores/{id}/payouts?includeCancelled=true. Invoice pagination MUST be
 * exhausted; hitting the bounded page ceiling fails closed, not truncate.
 * Only disposable loopback fixtures and stubbed fetches are supported.
 */
export async function readRegtestGreenfieldInventory({
  testOnly, network, serverUrl, storeId, apiKey,
  fetchImpl = fetch, pageSize = 50, maxPages = 20,
} = {}) {
  const base = requireRegtestOrigin({ testOnly, network, serverUrl, storeId, apiKey });
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 20 ||
      typeof fetchImpl !== "function") {
    throw Error("Invalid bounded Greenfield pagination options");
  }
  const prefix = "/api/v1/stores/" + encodeURIComponent(storeId);
  const invoices = [];
  let exhausted = false;
  for (let page = 0; page < maxPages; page++) {
    const batch = await requestArray(
      base, prefix + "/invoices?take=" + pageSize + "&skip=" + (page * pageSize),
      apiKey, fetchImpl,
    );
    if (batch.length > pageSize) throw Error("Greenfield invoice page overflow; retain hold");
    invoices.push(...batch);
    if (batch.length < pageSize) {
      exhausted = true;
      break;
    }
  }
  if (!exhausted) throw Error("Greenfield invoice pagination incomplete; retain hold");
  const payouts = await requestArray(
    base, prefix + "/payouts?includeCancelled=true", apiKey, fetchImpl,
  );
  if (payouts.length > 2000) throw Error("Greenfield payout inventory too large; retain hold");
  return Object.freeze({
    storeId, network: "regtest", inventoryComplete: true,
    invoices, payouts, readOnly: true,
  });
}

function add(list, code) { if (!list.includes(code)) list.push(code); }
function exactSats(value) {
  try { return btcAmountToSats(value); } catch { return null; }
}

/**
 * Independently match the complete provider view to a trusted test ledger.
 * The caller must acquire provider inventory while ALL invoice writers are
 * fenced, and furnish independently checked chain wallet evidence.
 *
 * This function validates input facts; it does NOT establish their provenance,
 * nor prove that an external Prism setting has been changed.
 */
export function assessRegtestProviderDrain({
  testOnly, network, storeId, inventory, ledgerInvoices, expectedClaims,
} = {}) {
  if (testOnly !== true || network !== "regtest" ||
      !safeId.test(storeId || "")) {
    throw Error("Provider drain assessment is regtest-only");
  }
  const reasons = [];
  if (!inventory || inventory.readOnly !== true ||
      inventory.network !== "regtest" || inventory.storeId !== storeId ||
      inventory.inventoryComplete !== true ||
      !Array.isArray(inventory.invoices) || !Array.isArray(inventory.payouts) ||
      !Array.isArray(ledgerInvoices) || !Array.isArray(expectedClaims)) {
    return Object.freeze({
      status: "blocked", reasons: ["INCOMPLETE_PROVIDER_OR_LEDGER_EVIDENCE"],
      eligibleForManualSyncReview: false, activationAllowed: false,
      automaticPayoutAllowed: false, productionReady: false,
    });
  }
  const providerInvoices = new Map();
  const localInvoices = new Map();
  const providerPayouts = new Map();
  const localClaims = new Map();

  for (const i of inventory.invoices) {
    if (!safeId.test(i?.id || "") || !validInvoiceStatus.has(i?.status) ||
        typeof i?.metadata?.orderId !== "string" ||
        !safeId.test(i.metadata.orderId) ||
        typeof i.additionalStatus !== "string") {
      add(reasons, "MALFORMED_PROVIDER_INVOICE"); continue;
    }
    if (providerInvoices.has(i.id)) add(reasons, "DUPLICATE_PROVIDER_INVOICE");
    providerInvoices.set(i.id, i);
    if (i.status !== "Settled" || i.additionalStatus !== "None")
      add(reasons, "OUTSTANDING_OR_EXCEPTION_INVOICE");
  }
  for (const i of ledgerInvoices) {
    if (!safeId.test(i?.invoiceId || "") || !safeId.test(i?.orderRef || "")) {
      add(reasons, "MALFORMED_LEDGER_INVOICE"); continue;
    }
    if (localInvoices.has(i.invoiceId)) add(reasons, "DUPLICATE_LEDGER_INVOICE");
    localInvoices.set(i.invoiceId, i);
    if (i.independentFinality?.claimsConfirmed !== true ||
        i.independentFinality?.walletReceiptsConfirmed !== true)
      add(reasons, "MISSING_INDEPENDENT_FINALITY");
    const observed = providerInvoices.get(i.invoiceId);
    if (!observed) add(reasons, "MISSING_PROVIDER_INVOICE");
    else if (observed.metadata.orderId !== i.orderRef)
      add(reasons, "ORDER_REFERENCE_MISMATCH");
  }
  for (const id of providerInvoices.keys())
    if (!localInvoices.has(id)) add(reasons, "UNKNOWN_PROVIDER_INVOICE");

  for (const p of inventory.payouts) {
    if (!safeId.test(p?.id || "") || !validPayoutState.has(p?.state) ||
        p?.payoutMethodId !== "BTC-CHAIN" ||
        typeof p.destination !== "string" ||
        exactSats(p.payoutAmount) === null) {
      add(reasons, "MALFORMED_PROVIDER_PAYOUT"); continue;
    }
    if (providerPayouts.has(p.id)) add(reasons, "DUPLICATE_PROVIDER_PAYOUT");
    providerPayouts.set(p.id, p);
    if (p.state !== "Completed") add(reasons, "OUTSTANDING_PROVIDER_PAYOUT");
  }
  const recipientsByInvoice = new Map();
  for (const c of expectedClaims) {
    if (!safeId.test(c?.payoutId || "") ||
        !safeId.test(c?.invoiceId || "") ||
        !safeId.test(c?.recipientId || "") ||
        typeof c.destination !== "string" || !c.destination ||
        typeof c.expectedSats !== "bigint" || c.expectedSats <= 0n ||
        c.walletConfirmedSats !== c.expectedSats ||
        !Number.isSafeInteger(c.walletConfirmations) ||
        c.walletConfirmations < 1) {
      add(reasons, "MISSING_OR_INVALID_INDEPENDENT_WALLET_RECEIPT"); continue;
    }
    if (localClaims.has(c.payoutId)) add(reasons, "DUPLICATE_LEDGER_CLAIM");
    localClaims.set(c.payoutId, c);
    if (!localInvoices.has(c.invoiceId)) add(reasons, "CLAIM_HAS_NO_LEDGER_INVOICE");
    const recipients = recipientsByInvoice.get(c.invoiceId) || new Set();
    if (recipients.has(c.recipientId)) add(reasons, "DUPLICATE_RECIPIENT_CLAIM");
    recipients.add(c.recipientId);
    recipientsByInvoice.set(c.invoiceId, recipients);
    const observed = providerPayouts.get(c.payoutId);
    if (!observed) add(reasons, "MISSING_PROVIDER_PAYOUT");
    else if (observed.destination !== c.destination ||
             exactSats(observed.payoutAmount) !== c.expectedSats)
      add(reasons, "PAYOUT_AMOUNT_OR_DESTINATION_MISMATCH");
  }
  for (const id of providerPayouts.keys())
    if (!localClaims.has(id)) add(reasons, "UNKNOWN_PROVIDER_PAYOUT");
  for (const id of localInvoices.keys()) {
    if ((recipientsByInvoice.get(id)?.size || 0) < 2)
      add(reasons, "MISSING_TWO_RECIPIENT_CLAIMS");
  }
  return Object.freeze({
    status: reasons.length ? "blocked" : "eligible_for_operator_review_only",
    reasons: Object.freeze(reasons),
    eligibleForManualSyncReview: reasons.length === 0,
    activationAllowed: false, automaticPayoutAllowed: false,
    productionReady: false,
  });
}

/**
 * An external configuration write is NOT implemented. Operator recovery MUST
 * preserve the checkout hold when its result is unknown, failed or apparently
 * successful. Future code needs separate read-back + immutable audit + unlock.
 */
export function assessRegtestSyncRecovery({testOnly, network, phase, holdPresent} = {}) {
  if (testOnly !== true || network !== "regtest") throw Error("Recovery fixture is regtest-only");
  const phases = new Set([
    "before_external_change", "external_change_unknown",
    "external_change_failed", "external_change_reported_success",
  ]);
  if (!phases.has(phase)) throw Error("Unknown synchronization recovery phase");
  return Object.freeze({
    status: holdPresent === true ? "hold_requires_manual_reconciliation" :
      "critical_missing_checkout_hold",
    phase,
    nextAction: holdPresent === true ?
      (phase === "before_external_change" ? "operator_review_provider_inventory" :
       "operator_verify_provider_state_and_wallets") :
      "disable_checkout_and_escalate",
    checkoutReleaseAllowed: false,
    prismConfigurationWriteAllowed: false,
    automaticPayoutAllowed: false,
    productionReady: false,
  });
}
