"use client";

import { useActionState } from "react";
import { SHIPMENT_REVIEW_ACTIONS } from "@/lib/supplier/held-shipment-plans.mjs";
import { saveHeldShipmentPlan, type PlanActionState } from "./held-shipment-plan-actions";

const initial: PlanActionState = { message: "" };

export function HeldShipmentPlanTransition({ storeId, orderId, shipmentId, revision, requestId, actions }: {
  storeId: string;
  orderId: string;
  shipmentId: string;
  revision: number;
  requestId: string;
  actions: string[];
}) {
  const [result, submit, pending] = useActionState(saveHeldShipmentPlan, initial);
  return <>
    {actions.length > 0 && <form action={submit} className="apex-orders-plan-action">
      <input type="hidden" name="store_id" value={storeId} />
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <input type="hidden" name="expected_revision" value={revision} />
      <input type="hidden" name="request_id" value={requestId} />
      <label htmlFor={`plan-action-${shipmentId}`}>Review action</label>
      <div className="apex-orders-plan-controls">
        <select id={`plan-action-${shipmentId}`} name="review_action" required defaultValue="">
          <option value="" disabled>Choose an action</option>
          {actions.map((action) => <option key={action} value={action}>
            {SHIPMENT_REVIEW_ACTIONS[action as keyof typeof SHIPMENT_REVIEW_ACTIONS].label}
          </option>)}
        </select>
        <button className="button secondary" disabled={pending}>{pending ? "Saving…" : "Apply"}</button>
      </div>
    </form>}
    {result.message && <p className="notice" role={result.error ? "alert" : "status"}>{result.message}</p>}
  </>;
}
