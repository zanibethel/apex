"use server";
import { revalidatePath } from "next/cache";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";
import { buildApexSharedThreeWayDraftV1 } from "@/lib/payments/apex-shared-three-way-split-v1.mjs";

type Result = { ok: boolean; message: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveMultiRecipientDraft(_previous: Result, form: FormData): Promise<Result> {
  if (process.env.APEX_MULTI_SPLIT_DRAFT_WRITES_ENABLED !== "true")
    return { ok: false, message: "Draft saving is disabled until database security review." };
  const scopeType = form.get("scopeType"), scopeId = form.get("scopeId");
  const raw = form.get("recipients");
  const ruleId = form.get("ruleId");
  const template = form.get("template");
  if (template !== null && template !== "apex_shared_three_way_v1")
    return { ok: false, message: "Unknown payout template." };
  if (!["storefront", "supplier", "product"].includes(String(scopeType)) ||
      typeof scopeId !== "string" || !uuid.test(scopeId) ||
      (ruleId !== null && (typeof ruleId !== "string" || (ruleId !== "" && !uuid.test(ruleId)))) ||
      typeof raw !== "string" || raw.length > 12000)
    return { ok: false, message: "Invalid scope or recipient configuration." };
  let recipients: unknown;
  try { recipients = JSON.parse(raw); } catch { return { ok: false, message: "Invalid recipient JSON." }; }
  if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > 100)
    return { ok: false, message: "Enter 1 to 100 recipients." };
  const seen = new Set<string>();
  let total = 0;
  for (const entry of recipients) {
    if (!entry || typeof entry !== "object") return { ok: false, message: "Invalid recipient." };
    const { recipient_id, basis_points } = entry as Record<string, unknown>;
    if (typeof recipient_id !== "string" || !uuid.test(recipient_id) ||
        seen.has(recipient_id) || !Number.isInteger(basis_points) ||
        (basis_points as number) < 0 || (basis_points as number) > 10000)
      return { ok: false, message: "Recipients must have unique valid IDs and basis points." };
    seen.add(recipient_id);
    total += basis_points as number;
  }
  if (total !== 10000) return { ok: false, message: "Shares must total exactly 100%." };
  // Template mode is an explicitly three-recipient, single-store proposal.
  // Preserve legacy generic drafts, but prevent template-based bypasses:
  // editing an existing rule or spoofing the fixed platform commission.
  if (template === "apex_shared_three_way_v1") {
    if (scopeType !== "storefront" || ruleId || recipients.length !== 3 ||
        recipients.some(row => Object.keys(row).sort().join(",") !== "basis_points,recipient_id"))
      return { ok: false, message: "Three-way template requires one store and three unique recipients." };
    try {
      const [apex,lily,tierra] = recipients;
      const normalized = buildApexSharedThreeWayDraftV1({
        storeId: scopeId,
        recipientIds: {apex:apex.recipient_id,lily:lily.recipient_id,tierra:tierra.recipient_id},
        lilyBasisPoints: lily.basis_points,
      });
      if (normalized.allocations.some((row,index)=>
          row.recipient_id !== recipients[index].recipient_id ||
          row.basis_points !== recipients[index].basis_points))
        throw Error("Mismatched split");
    } catch {
      return {ok:false,message:"Use 10% Apex plus two positive supplier shares totaling 90%."};
    }
  }
  const client = await createSupplierServerClient();
  if (!client) return { ok: false, message: "Admin service unavailable." };
  const { data, error } = await client.auth.getUser();
  if (error || !isVerifiedPlatformAdmin(data.user))
    return { ok: false, message: "Verified administrator access required." };
  if (template === "apex_shared_three_way_v1") {
    // Do not trust the client-side dropdown label or supplier claims.
    // Fetch all recipient types under the verified admin's scoped RLS read.
    const ids = recipients.map(row => row.recipient_id);
    const directory = await client.from("payout_recipients")
      .select("id,recipient_type,status").in("id",ids).limit(4);
    if (directory.error || directory.data?.length !== 3 ||
        ids.some((id,index) => {
          const record = directory.data?.find(r => r.id === id);
          return !record || record.status !== "active" ||
            record.recipient_type !== (index === 0 ? "platform" : "supplier");
        }))
      return {ok:false,message:"Choose one active platform and two active supplier recipients."};
  }
  const { data: saved, error: saveError } = await client.rpc("save_payout_rule_draft", {
    p_rule_id: ruleId || null, p_scope_type: scopeType, p_scope_id: scopeId, p_recipients: recipients,
  });
  if (saveError || !saved) return { ok: false, message: "Draft was not saved. Confirm the reviewed migration and recipient records are installed." };
  revalidatePath("/admin/splits/configure");
  return { ok: true, message: template === "apex_shared_three_way_v1"
    ? "New versioned 10% / supplier-pool draft saved (ID: " + saved + "). No BTCPay/Prism payout rule was activated."
    : "Draft saved (ID: " + saved + "). No payout rule was activated." };
}
