"use server";

import { revalidatePath } from "next/cache";
import { getSupplierWorkspace } from "@/lib/auth/supplier-workspace";
import {
  canReviewHeldShipmentPlans,
  heldShipmentPlanErrorMessage,
  isHeldShipmentPlanReceipt,
  parseHeldShipmentPlanCommand,
} from "@/lib/supplier/held-shipment-plans.mjs";

export type PlanActionState = { message: string; error?: boolean };

export async function saveHeldShipmentPlan(
  _previous: PlanActionState, formData: FormData,
): Promise<PlanActionState> {
  const command = parseHeldShipmentPlanCommand(formData);
  if (!command) return { error: true, message: "Check the quantities or review action and try again." };

  const workspace = await getSupplierWorkspace();
  const store = workspace?.stores.find(({ id }) => id === command.p_store_id);
  if (!workspace || !store || !canReviewHeldShipmentPlans(workspace.memberships, store.supplier_id)) {
    return { error: true, message: heldShipmentPlanErrorMessage({ code: "42501" }) };
  }

  const { data, error } = await workspace.client.rpc("save_supplier_held_shipment_plan_v1", command);
  if (error || !isHeldShipmentPlanReceipt(data, command)) {
    return { error: true, message: heldShipmentPlanErrorMessage(error) };
  }

  revalidatePath(`/supplier/orders/${command.p_order_id}`);
  return { message: data.replayed ? "This change was already saved." : "Review plan saved." };
}
