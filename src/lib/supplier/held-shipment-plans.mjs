import { isSupplierOrderId } from "./held-order-record.mjs";

const PLAN_PAGE_SIZE = 10;
const MAX_PAGE = 10000;
const MAX_REVISION = 2147483647;
const CANCELLATION_REASONS = ["quantity_correction", "plan_no_longer_needed"];
const REVIEW_TRANSITIONS = Object.freeze({
  queued: ["review_started", ...CANCELLATION_REASONS],
  under_review: ["review_issue", ...CANCELLATION_REASONS],
  exception: ["review_reopened", ...CANCELLATION_REASONS],
  cancelled: [],
});

export const SHIPMENT_REVIEW_ACTIONS = Object.freeze({
  review_started: { target: "under_review", label: "Start review" },
  review_issue: { target: "exception", label: "Flag a review issue" },
  review_reopened: { target: "under_review", label: "Reopen review" },
  quantity_correction: { target: "cancelled", label: "Cancel to correct quantities" },
  plan_no_longer_needed: { target: "cancelled", label: "Cancel plan no longer needed" },
});

export const SHIPMENT_REVIEW_LABELS = Object.freeze({
  queued: "Queued for review",
  under_review: "Under review",
  exception: "Review issue",
  cancelled: "Cancelled",
});

export const SHIPMENT_REVIEW_REASONS = Object.freeze({
  plan_created: "Review plan saved",
  review_started: "Review started",
  review_issue: "Flagged for follow-up",
  review_reopened: "Review reopened",
  quantity_correction: "Cancelled to correct quantities",
  plan_no_longer_needed: "Cancelled because the plan was no longer needed",
});

export function canReviewHeldShipmentPlans(memberships, supplierId) {
  return memberships.some(({ supplier_id, role }) =>
    supplier_id === supplierId && (role === "owner" || role === "manager"));
}

export function shipmentReviewActions(state) {
  return Object.hasOwn(REVIEW_TRANSITIONS, state) ? REVIEW_TRANSITIONS[state] : [];
}

export function parseShipmentPlanPage(value) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,4})$/.test(value)) return 0;
  return Number(value) <= MAX_PAGE ? Number(value) : 0;
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function integerBetween(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isUtcTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function parsePlanHistory(events, plan) {
  if (!Array.isArray(events) || events.length !== Math.min(plan.revision, PLAN_PAGE_SIZE)) return null;
  for (const [index, event] of events.entries()) {
    if (!exactKeys(event, ["revision", "actor_id", "from_state", "to_state", "reason", "occurred_at"]) ||
      event.revision !== plan.revision - index || !isSupplierOrderId(event.actor_id) ||
      !isUtcTime(event.occurred_at) || !Object.hasOwn(SHIPMENT_REVIEW_LABELS, event.to_state) ||
      !Object.hasOwn(SHIPMENT_REVIEW_REASONS, event.reason)) return null;
    if (event.revision === 1) {
      if (event.from_state !== null || event.to_state !== "queued" || event.reason !== "plan_created") return null;
    } else if (!shipmentReviewActions(event.from_state).includes(event.reason) ||
      SHIPMENT_REVIEW_ACTIONS[event.reason].target !== event.to_state) return null;
    if (event.to_state !== (index === 0 ? plan.state : events[index - 1].from_state)) return null;
  }
  return events;
}

/**
 * @typedef {{revision: number, actor_id: string, from_state: string | null,
 * to_state: string, reason: string, occurred_at: string}} ReviewEvent
 * @typedef {{shipment_id: string, state: keyof typeof SHIPMENT_REVIEW_LABELS, revision: number,
 * allocations: {line_id: string, quantity: number}[], events: ReviewEvent[]}} ReviewPlan
 * @returns {{reviewRevision: number, plannedQuantities: Record<string, number>,
 * plans: ReviewPlan[], page: number, hasMore: boolean} | null}
 */
export function parseHeldShipmentPlans(value, storeId, orderId, page, originalLines) {
  if (!exactKeys(value, ["schema_version", "scope", "shipping_enabled", "store_id", "order_id",
    "page", "has_more", "review_revision", "lines", "plans"]) ||
    value.schema_version !== 1 || value.scope !== "held_review" || value.shipping_enabled !== false ||
    value.store_id !== storeId || value.order_id !== orderId || value.page !== page ||
    typeof value.has_more !== "boolean" || !integerBetween(value.review_revision, 0, MAX_REVISION) ||
    !Array.isArray(value.lines) || value.lines.length !== originalLines.length ||
    !Array.isArray(value.plans) || value.plans.length > PLAN_PAGE_SIZE ||
    (value.has_more && value.plans.length !== PLAN_PAGE_SIZE)) return null;

  const purchased = new Map(originalLines.map(({ id, quantity }) => [id, quantity]));
  const planned = new Map();
  for (const line of value.lines) {
    if (!exactKeys(line, ["line_id", "purchased_quantity", "planned_quantity"]) ||
      !purchased.has(line.line_id) || planned.has(line.line_id) ||
      line.purchased_quantity !== purchased.get(line.line_id) ||
      !integerBetween(line.planned_quantity, 0, line.purchased_quantity)) return null;
    planned.set(line.line_id, line.planned_quantity);
  }

  const visibleQuantities = new Map();
  const seen = new Set();
  for (const plan of value.plans) {
    if (!exactKeys(plan, ["shipment_id", "state", "revision", "allocations", "events"]) ||
      !isSupplierOrderId(plan.shipment_id) || seen.has(plan.shipment_id) ||
      !Object.hasOwn(SHIPMENT_REVIEW_LABELS, plan.state) ||
      !integerBetween(plan.revision, 1, value.review_revision) ||
      !Array.isArray(plan.allocations) || plan.allocations.length < 1 ||
      plan.allocations.length > purchased.size || !parsePlanHistory(plan.events, plan)) return null;
    seen.add(plan.shipment_id);
    const allocated = new Set();
    for (const row of plan.allocations) {
      if (!exactKeys(row, ["line_id", "quantity"]) || allocated.has(row.line_id) ||
        !integerBetween(row.quantity, 1, purchased.get(row.line_id))) return null;
      allocated.add(row.line_id);
      if (plan.state !== "cancelled") {
        visibleQuantities.set(row.line_id, (visibleQuantities.get(row.line_id) ?? 0) + row.quantity);
      }
    }
  }
  for (const [lineId, quantity] of planned) {
    const visible = visibleQuantities.get(lineId) ?? 0;
    if (visible > quantity || (page === 0 && !value.has_more && visible !== quantity)) return null;
  }

  return {
    reviewRevision: value.review_revision,
    plannedQuantities: Object.fromEntries(planned),
    plans: value.plans,
    page,
    hasMore: value.has_more && page < MAX_PAGE,
  };
}

const COMMAND_FIELDS = new Set(["store_id", "order_id", "request_id", "shipment_id", "expected_revision", "review_action"]);

export function parseHeldShipmentPlanCommand(formData) {
  const fields = new Map();
  const quantities = new Map();
  for (const [key, value] of formData) {
    if (key.startsWith("$ACTION_")) continue;
    if (typeof value !== "string") return null;
    if (COMMAND_FIELDS.has(key)) {
      if (fields.has(key)) return null;
      fields.set(key, value);
      continue;
    }
    const lineId = key.slice(4).toLowerCase();
    if (!key.startsWith("qty:") || !isSupplierOrderId(lineId) || quantities.has(lineId) ||
      quantities.size >= 50 || !/^(0|[1-9][0-9]?|100)?$/.test(value)) return null;
    quantities.set(lineId, Number(value));
  }

  const storeId = fields.get("store_id");
  const orderId = fields.get("order_id");
  const requestId = fields.get("request_id");
  if (![storeId, orderId, requestId].every(isSupplierOrderId)) return null;
  const identity = { p_store_id: storeId, p_order_id: orderId, p_request_id: requestId };
  if (fields.size === 3) {
    const allocations = Array.from(quantities, ([line_id, quantity]) => ({ line_id, quantity }))
      .filter(({ quantity }) => quantity > 0);
    return allocations.length ? {
      ...identity, p_shipment_id: null, p_expected_revision: null, p_to_state: null, p_allocations: allocations, p_reason: null,
    } : null;
  }

  const shipmentId = fields.get("shipment_id");
  const revision = fields.get("expected_revision");
  const reason = fields.get("review_action");
  if (quantities.size || !isSupplierOrderId(shipmentId) ||
    typeof revision !== "string" || !/^[1-9][0-9]{0,9}$/.test(revision) ||
    !integerBetween(Number(revision), 1, MAX_REVISION) ||
    !Object.hasOwn(SHIPMENT_REVIEW_ACTIONS, reason)) return null;
  return {
    ...identity, p_shipment_id: shipmentId, p_expected_revision: Number(revision),
    p_to_state: SHIPMENT_REVIEW_ACTIONS[reason].target, p_allocations: null, p_reason: reason,
  };
}

export function isHeldShipmentPlanReceipt(value, command) {
  return exactKeys(value, ["schema_version", "scope", "store_id", "order_id", "request_id",
    "shipment_id", "revision", "replayed"]) &&
    value.schema_version === 1 && value.scope === "held_review" &&
    value.store_id === command.p_store_id && value.order_id === command.p_order_id &&
    value.request_id === command.p_request_id && isSupplierOrderId(value.shipment_id) &&
    (command.p_shipment_id === null || value.shipment_id === command.p_shipment_id) &&
    value.revision === (command.p_expected_revision ?? 0) + 1 && typeof value.replayed === "boolean";
}

export function heldShipmentPlanErrorMessage(error) {
  if (error?.code === "PT409") {
    switch (error.message) {
      case "shipment_plan_revision_conflict": {
        const current = /^Current plan revision is ([1-9][0-9]{0,9})$/.exec(error.details ?? "")?.[1];
        return current ? `This plan is now at revision ${current}. Reload the order before trying again.` :
          "This plan changed after you opened it. Reload the order to see the latest revision.";
      }
      case "shipment_plan_quantity_conflict":
        return "Another plan uses some of those units. Reload the order to see the remaining quantities.";
      case "shipment_plan_request_conflict":
        return "This submission key was already used for a different request. Reload the order before trying again.";
    }
  }
  if (error?.code === "40001") return "The plan changed during this request. Reload the order and try again.";
  if (error?.code === "42501") return "Shipment review is unavailable for this order or supplier account.";
  if (error?.code === "22023") return "Check the quantities or review action and try again.";
  return "Shipment review is temporarily unavailable. Reload the order and try again.";
}
