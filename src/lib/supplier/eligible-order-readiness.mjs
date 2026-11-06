/**
 * Track 2 -> Track 3 eligibility boundary, v1. The only live source today
 * is a held order snapshot; independent attestations do not yet exist.
 * This parser refuses any non-empty eligible lane or new capability flag.
 * Do not loosen it until an independently verified server-side v2 source,
 * with separate source/authorization tests, replaces this contract.
 */
import {isSupplierOrderId} from "./held-order-record.mjs";

const FIELDS = [
 "schema_version","source","store_id","held_order_count",
 "eligible_order_count","eligible_orders","blocker","read_only",
 "eligible_queue_enabled","payment_verified","product_and_transport_verified",
 "delivery_access_enabled","shipping_enabled","can_purchase_label","can_record_tracking",
];

export function parseSupplierEligibleOrderReadinessV1(value, storeId) {
 if (!isSupplierOrderId(storeId) || value === null || typeof value !== "object" ||
  Array.isArray(value) || Object.keys(value).length !== FIELDS.length ||
  !FIELDS.every(key => Object.hasOwn(value,key)) ||
  value.schema_version !== 1 ||
  value.source !== "held_order_readiness_no_independent_attestation" ||
  value.store_id !== storeId ||
  !Number.isSafeInteger(value.held_order_count) || value.held_order_count < 0 ||
  value.eligible_order_count !== 0 ||
  !Array.isArray(value.eligible_orders) || value.eligible_orders.length !== 0 ||
  value.blocker !== "independent_eligibility_evidence_not_integrated" ||
  value.read_only !== true || value.eligible_queue_enabled !== false ||
  value.payment_verified !== false || value.product_and_transport_verified !== false ||
  value.delivery_access_enabled !== false || value.shipping_enabled !== false ||
  value.can_purchase_label !== false || value.can_record_tracking !== false) return null;

 return Object.freeze({
  heldOrderCount: value.held_order_count,
  status: "evidence_not_integrated",
  canShip: false,
  canPurchaseLabel: false,
  canRecordTracking: false,
  canReadDelivery: false,
  canPay: false,
  eligibleOrders: Object.freeze([]),
 });
}
