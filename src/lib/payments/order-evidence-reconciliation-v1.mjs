/**
 * Track 2 -> Track 3, v1. Pure, bounded diagnostic reconciliation.
 *
 * Inputs MUST be read independently by future privileged server adapters.
 * This helper does not validate BTCPay cryptographic signatures, query a
 * payment provider, certify lawful merchandise/transport, grant fulfillment
 * authority, read delivery PII, persist events, or activate any release gate.
 * Even internally consistent synthetic evidence is NOT a shipping permission.
 */
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_LINES = 50;
const MAX_EVENTS = 100;
const MAX_CENTS = 999999999999n;
const ALLOWED_EVENTS = new Set([
 "settlement_observed", "refund_observed", "reversal_observed",
 "invoice_invalid_observed", "eligibility_revoked",
]);
const exact = (v, fields) => v !== null && typeof v === "object" &&
 !Array.isArray(v) && Object.keys(v).length === fields.length &&
 fields.every(field => Object.hasOwn(v, field));
const id = v => typeof v === "string" && UUID.test(v);
const timestamp = v => typeof v === "string" && UTC.test(v) &&
 Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const cents = v => typeof v === "string" &&
 /^(0|[1-9][0-9]{0,11})$/.test(v) && BigInt(v) <= MAX_CENTS;
const positive = (n, max) => Number.isSafeInteger(n) && n >= 1 && n <= max;
const fail = code => code;

const ORDER = [
 "store_id", "order_id", "original_purchased_at_utc",
 "source_order_reference", "currency", "gross_cents",
 "line_count", "record_status",
];
const LINE = [
 "store_id", "order_id", "line_id", "line_number",
 "product_id", "quantity", "unit_price_cents", "subtotal_cents",
];
const PAYMENT = [
 "provider", "provider_store_id", "invoice_id",
 "store_id", "order_id", "metadata_order_id", "invoice_currency",
 "invoice_amount_cents", "invoice_status", "additional_status",
 "observed_at_utc",
];
const EVENT = [
 "event_id", "kind", "store_id", "order_id", "invoice_id",
 "raw_sha256", "observed_at_utc",
];
const REVIEW = [
 "store_id", "order_id", "line_id", "authorization_id",
 "decision", "transport_decision", "review_version",
 "expires_at_utc", "revoked_at_utc",
];
const DESTINATION = [
 "store_id", "order_id", "envelope_exists",
 "validation_reference", "validated_at_utc",
];
const validText = (v, max) => typeof v === "string" &&
 v.length >= 1 && v.length <= max && v.trim() === v &&
 !/[\x00-\x1f\x7f]/.test(v);

/**
 * An internal consistency/coverage audit, not an authentication or eligibility
 * authorization function. Call only with store-scoped, access-controlled
 * snapshots and independently retrieved provider observations.
 */
export function reconcileOrderEvidenceV1({
 order, lines, payment, events, lineReviews, destination,
} = {}, {nowUtc} = {}) {
 const reasons = new Set();
 const now = timestamp(nowUtc) ? Date.parse(nowUtc) : null;
 if (now === null) reasons.add(fail("invalid_reference_time"));

 let validOrder = exact(order, ORDER) &&
  id(order.store_id) && id(order.order_id) &&
  timestamp(order.original_purchased_at_utc) &&
  validText(order.source_order_reference, 200) &&
  order.currency === "USD" && cents(order.gross_cents) &&
  Number.isSafeInteger(order.line_count) &&
  order.line_count >= 1 && order.line_count <= MAX_LINES &&
  order.record_status === "held_unverified";
 if (!validOrder) reasons.add(fail("original_order_invalid_or_not_held"));
 if (validOrder && Date.parse(order.original_purchased_at_utc) > now)
  reasons.add(fail("purchase_time_in_future"));

 let lineCount = 0;
 let quantity = 0;
 let subTotal = 0n;
 const lineIds = new Set();
 const products = new Set();
 if (!Array.isArray(lines) || lines.length < 1 ||
  lines.length > MAX_LINES || (validOrder && lines.length !== order.line_count)) {
  reasons.add(fail("line_completeness_unverified"));
 } else {
  let previousPosition = 0;
  for (const line of lines) {
   if (!exact(line, LINE) || !id(line.store_id) ||
    !id(line.order_id) || !id(line.line_id) || !id(line.product_id) ||
    !positive(line.line_number, MAX_LINES) ||
    line.line_number !== previousPosition + 1 ||
    !positive(line.quantity, 100) ||
    !cents(line.unit_price_cents) || !cents(line.subtotal_cents) ||
    (cents(line.unit_price_cents) && cents(line.subtotal_cents) &&
     BigInt(line.unit_price_cents) * BigInt(line.quantity) !==
      BigInt(line.subtotal_cents)) ||
    (validOrder && (line.store_id !== order.store_id ||
     line.order_id !== order.order_id)) ||
    lineIds.has(line.line_id.toLowerCase())) {
    reasons.add(fail("line_identity_amount_or_scope_conflict"));
   } else {
    lineCount++;
    quantity += line.quantity;
    subTotal += BigInt(line.subtotal_cents);
    lineIds.add(line.line_id.toLowerCase());
    products.add(line.product_id.toLowerCase());
   }
   if (Number.isSafeInteger(line?.line_number)) previousPosition = line.line_number;
  }
 }
 if (validOrder && lineCount !== order.line_count)
  reasons.add(fail("line_completeness_unverified"));

 let paymentMatched = false;
 if (!exact(payment, PAYMENT)) reasons.add(fail("provider_readback_unavailable"));
 else {
  if (payment.provider !== "BTCPay" ||
   !validText(payment.provider_store_id, 100) ||
   !validText(payment.invoice_id, 100) ||
   !id(payment.store_id) || !id(payment.order_id) ||
   !id(payment.metadata_order_id) ||
   !timestamp(payment.observed_at_utc) ||
   payment.invoice_currency !== "USD" ||
   !cents(payment.invoice_amount_cents)) {
   reasons.add(fail("provider_readback_invalid"));
  } else if (validOrder && (payment.store_id !== order.store_id ||
   payment.order_id !== order.order_id ||
   payment.metadata_order_id !== order.order_id ||
   payment.invoice_amount_cents !== order.gross_cents)) {
   reasons.add(fail("provider_order_amount_or_scope_conflict"));
  } else {
   paymentMatched = true;
  }
  if (payment.invoice_status !== "Settled" ||
   payment.additional_status !== "None")
   reasons.add(fail("settlement_not_independently_confirmed"));
  if (now !== null && timestamp(payment.observed_at_utc) &&
   (Date.parse(payment.observed_at_utc) > now ||
    now - Date.parse(payment.observed_at_utc) > 86400000))
   reasons.add(fail("provider_observation_stale_or_future"));
 }
 if (!Array.isArray(events) || events.length > MAX_EVENTS)
  reasons.add(fail("provider_event_history_unavailable"));
 else {
  const seen = new Map();
  for (const event of events) {
   if (!exact(event, EVENT) || !id(event.event_id) ||
    !ALLOWED_EVENTS.has(event.kind) || !SHA256.test(event.raw_sha256) ||
    !id(event.store_id) || !id(event.order_id) ||
    !validText(event.invoice_id, 100) ||
    !timestamp(event.observed_at_utc)) {
    reasons.add(fail("provider_event_invalid"));
    continue;
   }
   const key = event.event_id.toLowerCase();
   const fingerprint = JSON.stringify(event);
   if (seen.has(key)) {
    if (seen.get(key) !== fingerprint)
     reasons.add(fail("provider_event_replay_conflict"));
    continue; // Identical delivery replay is one logical event.
   }
   seen.set(key, fingerprint);
   if (validOrder && (event.store_id !== order.store_id ||
    event.order_id !== order.order_id) ||
    paymentMatched && event.invoice_id !== payment.invoice_id)
    reasons.add(fail("provider_event_scope_conflict"));
   if (now !== null && Date.parse(event.observed_at_utc) > now)
    reasons.add(fail("provider_event_future"));
   if (["refund_observed", "reversal_observed",
     "invoice_invalid_observed", "eligibility_revoked"].includes(event.kind))
    reasons.add(fail("refund_reversal_or_revocation_observed"));
  }
 }

 if (!Array.isArray(lineReviews) || lineReviews.length !== lineCount ||
  lineCount === 0) reasons.add(fail("per_line_authorization_incomplete"));
 else {
  const reviewed = new Set();
  for (const review of lineReviews) {
   if (!exact(review, REVIEW) ||
    !id(review.store_id) || !id(review.order_id) ||
    !id(review.line_id) || !id(review.authorization_id) ||
    !lineIds.has(review.line_id.toLowerCase()) ||
    reviewed.has(review.line_id.toLowerCase()) ||
    validOrder && (review.store_id !== order.store_id ||
     review.order_id !== order.order_id) ||
    !positive(review.review_version, 1000000000) ||
    !timestamp(review.expires_at_utc) ||
    (review.revoked_at_utc !== null &&
     !timestamp(review.revoked_at_utc))) {
    reasons.add(fail("per_line_authorization_identity_conflict"));
    continue;
   }
   reviewed.add(review.line_id.toLowerCase());
   if (review.decision !== "independently_approved" ||
    review.transport_decision !== "independently_approved" ||
    review.revoked_at_utc !== null ||
    now !== null && Date.parse(review.expires_at_utc) <= now)
    reasons.add(fail("product_transport_authorization_missing_expired_or_revoked"));
  }
  if (reviewed.size !== lineCount)
   reasons.add(fail("per_line_authorization_incomplete"));
 }

 if (!exact(destination, DESTINATION) ||
  !id(destination.store_id) || !id(destination.order_id) ||
  validOrder && (destination.store_id !== order.store_id ||
   destination.order_id !== order.order_id) ||
  destination.envelope_exists !== true ||
  !id(destination.validation_reference) ||
  !timestamp(destination.validated_at_utc) ||
  now !== null && timestamp(destination.validated_at_utc) &&
   Date.parse(destination.validated_at_utc) > now)
  reasons.add(fail("protected_delivery_validation_unavailable"));

 const reasonCodes = Object.freeze([...reasons].sort());
 return Object.freeze({
  schemaVersion: 1,
  status: reasonCodes.length ? "review_required" : "reconciled_unverified",
  reasonCodes,
  inspected: Object.freeze({
   lineCount, quantity, subtotalCents: subTotal.toString(),
   distinctProducts: products.size, eventsInspected:
    Array.isArray(events) && events.length <= MAX_EVENTS ? events.length : null,
  }),
  // Even an internally consistent record cannot prove provider authenticity
  // or legal authorization without independent, authenticated integrations.
  providerSignatureVerified: false,
  independentSettlementVerified: false,
  legalEligibilityVerified: false,
  deliveryAccessAuthorized: false,
  canReleaseCheckout: false,
  canShip: false,
  canPurchaseLabel: false,
  canRecordTracking: false,
 });
}
