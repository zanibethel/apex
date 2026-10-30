"use server";

import {revalidatePath} from "next/cache";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";

type SaveState={ok:boolean;message:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CENTS=999999999;

function dollarsToCents(raw:FormDataEntryValue|null):number|null {
  if(typeof raw!=="string"||!/^\d{1,7}(\.\d{1,2})?$/.test(raw))return null;
  const [whole,decimals=""]=raw.split(".");
  const n=Number(whole)*100+Number(decimals.padEnd(2,"0"));
  return Number.isSafeInteger(n)&&n>=0&&n<=MAX_CENTS?n:null;
}

export async function saveSupplierSourceCost(_previous:SaveState,form:FormData):Promise<SaveState> {
  if(process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")
    return {ok:false,message:"Private product editing is disabled."};
  const storeId=form.get("storeId"),candidateId=form.get("candidateId");
  const expectedRaw=form.get("expectedCostCents"),newCost=dollarsToCents(form.get("sourceCost"));
  if(typeof storeId!=="string"||!uuid.test(storeId)||
    typeof candidateId!=="string"||!uuid.test(candidateId)||
    typeof expectedRaw!=="string"||!/^\d{1,9}$/.test(expectedRaw)||
    newCost===null) return {ok:false,message:"Enter a valid source cost in USD."};
  const expected=Number(expectedRaw);
  if(!Number.isSafeInteger(expected)||expected>MAX_CENTS)
    return {ok:false,message:"Invalid source cost revision."};
  if(newCost===expected)return {ok:true,message:"Source cost is unchanged."};

  const w=await getSupplierWorkspace();
  if(!w||!w.stores.some(s=>s.id===storeId&&!s.is_public&&
    w.memberships.some(m=>m.supplier_id===s.supplier_id&&["owner","manager"].includes(m.role))))
    return {ok:false,message:"Supplier access required."};

  // Compare-and-swap avoids overwriting another supplier's update.
  // Database RLS also limits this to authorized private storefronts.
  const {data,error}=await w.client.from("supplier_import_candidates")
    .update({wholesale_cost_cents:newCost})
    .eq("store_id",storeId).eq("id",candidateId)
    .eq("wholesale_cost_cents",expected)
    .select("id").maybeSingle();
  if(error||!data)return {ok:false,message:"Source cost was not changed. Refresh in case another supplier updated it."};
  revalidatePath("/supplier/catalog");
  revalidatePath("/supplier/imports");
  return {ok:true,message:"Private source cost updated and recorded in audit history."};
}
