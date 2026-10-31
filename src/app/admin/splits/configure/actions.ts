"use server";
import { revalidatePath } from "next/cache";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";

type Result = { ok: boolean; message: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveMultiRecipientDraft(_previous: Result, form: FormData): Promise<Result> {
  if (process.env.APEX_MULTI_SPLIT_DRAFT_WRITES_ENABLED !== "true")
    return { ok: false, message: "Draft saving is disabled until database security review." };
  const scopeType = form.get("scopeType"), scopeId = form.get("scopeId");
  const raw = form.get("recipients");
  const ruleId = form.get("ruleId");
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
  const client = await createSupplierServerClient();
  if (!client) return { ok: false, message: "Admin service unavailable." };
  const { data, error } = await client.auth.getUser();
  if (error || !isVerifiedPlatformAdmin(data.user))
    return { ok: false, message: "Verified administrator access required." };
  const { data: saved, error: saveError } = await client.rpc("save_payout_rule_draft", {
    p_rule_id: ruleId || null, p_scope_type: scopeType, p_scope_id: scopeId, p_recipients: recipients,
  });
  if (saveError || !saved) return { ok: false, message: "Draft was not saved. Confirm the reviewed migration and recipient records are installed." };
  revalidatePath("/admin/splits/configure");
  return { ok: true, message: "Draft saved (ID: " + saved + "). No payout rule was activated." };
}
