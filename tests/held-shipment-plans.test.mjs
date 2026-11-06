import assert from "node:assert/strict";
import test from "node:test";
import {
  canReviewHeldShipmentPlans,
  heldShipmentPlanErrorMessage,
  isHeldShipmentPlanReceipt,
  parseHeldShipmentPlanCommand,
  parseHeldShipmentPlans,
  parseShipmentPlanPage,
  shipmentReviewActions,
} from "../src/lib/supplier/held-shipment-plans.mjs";

const id = (n) => `a2150000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [store, order, request, shipment, firstLine, secondLine, actor] = [1, 2, 3, 4, 5, 6, 7].map(id);
const originalLines = [{ id: firstLine, quantity: 5 }, { id: secondLine, quantity: 2 }];
const at = "2026-11-06T18:00:00.000Z";

function planResponse() {
  return {
    schema_version: 1, scope: "held_review", shipping_enabled: false,
    store_id: store, order_id: order, page: 0, has_more: false, review_revision: 3,
    lines: [
      { line_id: firstLine, purchased_quantity: 5, planned_quantity: 2 },
      { line_id: secondLine, purchased_quantity: 2, planned_quantity: 0 },
    ],
    plans: [
      { shipment_id: shipment, state: "queued", revision: 1, allocations: [{ line_id: firstLine, quantity: 2 }],
        events: [{ revision: 1, actor_id: actor, from_state: null, to_state: "queued", reason: "plan_created", occurred_at: at }] },
      { shipment_id: id(8), state: "cancelled", revision: 2, allocations: [{ line_id: secondLine, quantity: 1 }],
        events: [
          { revision: 2, actor_id: actor, from_state: "queued", to_state: "cancelled", reason: "quantity_correction", occurred_at: at },
          { revision: 1, actor_id: actor, from_state: null, to_state: "queued", reason: "plan_created", occurred_at: at },
        ] },
    ],
  };
}

function commandForm(fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ store_id: store, order_id: order, request_id: request, ...fields })) {
    form.append(key, value);
  }
  return form;
}

test("parses a held review ledger against immutable purchased lines and current capacity", () => {
  const review = parseHeldShipmentPlans(planResponse(), store, order, 0, originalLines);
  assert.ok(review);
  assert.deepEqual(review.plannedQuantities, { [firstLine]: 2, [secondLine]: 0 });
  assert.equal(review.plans[1].events[0].reason, "quantity_correction");
  assert.deepEqual(shipmentReviewActions("cancelled"), []);
  assert.deepEqual(shipmentReviewActions("label_ready"), []);
  assert.ok(shipmentReviewActions("queued").includes("review_started"));
  assert.equal(parseShipmentPlanPage("2"), 2);
  for (const value of ["-1", "10001", "1.1", ["2"]]) assert.equal(parseShipmentPlanPage(value), 0);
});

test("denies unsafe projections and allocations outside the purchased line or returned balance", () => {
  const invalid = [
    (data) => { data.store_id = id(9); },
    (data) => { data.order_id = id(9); },
    (data) => { data.shipping_enabled = true; },
    (data) => { data.plans[0].state = "packing"; },
    (data) => { data.plans[0].shipment_id = data.plans[1].shipment_id; },
    (data) => { data.plans[0].allocations[0].line_id = id(9); },
    (data) => { data.plans[0].allocations[0].quantity = 3; },
    (data) => { data.plans[0].delivery_address = "unexpected"; },
    (data) => { data.plans[1].events[0].from_state = "shipped"; },
    (data) => { data.plans[1].events[0].reason = "review_issue"; },
    (data) => { data.plans[1].events[0].occurred_at = "invalid"; },
    (data) => { data.plans[1].events.reverse(); },
    (data) => { data.lines[1].purchased_quantity = 3; },
    (data) => { data.lines[1].planned_quantity = 1; },
    (data) => { data.lines[0].planned_quantity = 10; },
  ];
  for (const tamper of invalid) {
    const data = planResponse();
    tamper(data);
    assert.equal(parseHeldShipmentPlans(data, store, order, 0, originalLines), null);
  }
});

test("accepts only review commands with immutable identifiers, bounded quantities and allowed reasons", () => {
  const form = commandForm({ [`qty:${firstLine}`]: "2", [`qty:${secondLine}`]: "0", "$ACTION_ID_test": "" });
  const create = parseHeldShipmentPlanCommand(form);
  assert.deepEqual(create?.p_allocations, [{ line_id: firstLine, quantity: 2 }]);
  assert.equal(create.p_shipment_id, null);
  const cancel = { shipment_id: shipment, expected_revision: "2", review_action: "quantity_correction" };
  const transition = parseHeldShipmentPlanCommand(commandForm(cancel));
  assert.equal(transition?.p_expected_revision, 2);
  assert.equal(transition.p_to_state, "cancelled");
  assert.equal(transition.p_reason, "quantity_correction");
  for (const fields of [
    { [`qty:${firstLine}`]: "0" }, { [`qty:${firstLine}`]: "1.5" }, { [`qty:${firstLine}`]: "101" },
    { [`qty:${firstLine}`]: "1", approved: "true" },
    { ...cancel, expected_revision: "0" }, { ...cancel, expected_revision: "2147483648" },
    { ...cancel, review_action: "shipped" }, { ...cancel, review_action: "__proto__" },
    { ...cancel, [`qty:${secondLine}`]: "1" },
  ]) assert.equal(parseHeldShipmentPlanCommand(commandForm(fields)), null);
  form.append(`qty:${firstLine.toUpperCase()}`, "1");
  assert.equal(parseHeldShipmentPlanCommand(form), null);
});

test("checks command receipts, isolates roles and shows safe conflict messages", () => {
  const command = parseHeldShipmentPlanCommand(commandForm({ [`qty:${firstLine}`]: "2" }));
  const receipt = { schema_version: 1, scope: "held_review", store_id: store, order_id: order,
    request_id: request, shipment_id: shipment, revision: 1, replayed: true };
  assert.equal(isHeldShipmentPlanReceipt(receipt, command), true);
  assert.equal(isHeldShipmentPlanReceipt({ ...receipt, request_id: id(9) }, command), false);
  assert.equal(isHeldShipmentPlanReceipt({ ...receipt, revision: 2 }, command), false);
  assert.equal(canReviewHeldShipmentPlans([{ supplier_id: store, role: "owner" }], store), true);
  assert.equal(canReviewHeldShipmentPlans([{ supplier_id: store, role: "manager" }], store), true);
  assert.equal(canReviewHeldShipmentPlans([{ supplier_id: store, role: "staff" }], store), false);
  assert.equal(canReviewHeldShipmentPlans([{ supplier_id: id(9), role: "owner" }], store), false);
  assert.match(heldShipmentPlanErrorMessage({ code: "PT409", message: "shipment_plan_revision_conflict",
    details: "Current plan revision is 2" }), /revision 2/);
  assert.match(heldShipmentPlanErrorMessage({ code: "PT409", message: "shipment_plan_quantity_conflict" }), /remaining quantities/);
  assert.match(heldShipmentPlanErrorMessage({ code: "PT409", message: "shipment_plan_request_conflict" }), /different request/);
  assert.doesNotMatch(heldShipmentPlanErrorMessage({ code: "42501", message: "hidden details" }), /hidden details/);
});
