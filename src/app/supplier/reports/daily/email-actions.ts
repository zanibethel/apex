"use server";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";

export async function updateSupplierDailyReportEmailPreference(form:FormData){
 const w=await getSupplierWorkspace();
 if(!w)redirect("/supplier/sign-in");
 const storeId=form.get("storeId");
 const mode=form.get("enabled");
 if(typeof storeId!=="string"||
  !w.stores.some(store=>store.id===storeId)||
  !["true","false"].includes(String(mode))){
  redirect("/supplier/reports/daily?email=error");
 }
 const desired=mode==="true";
 const result=await w.client.rpc("set_supplier_daily_report_email_preference",{
  p_store_id:storeId,p_enabled:desired,
 });
 if(result.error||!result.data||result.data.enabled!==desired){
  redirect("/supplier/reports/daily?email=error");
 }
 redirect("/supplier/reports/daily?email="+(desired?"enabled":"disabled"));
}
