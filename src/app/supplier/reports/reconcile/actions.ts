"use server";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {parseSalesReviewImport} from "@/lib/supplier/sales-reconciliation-csv.mjs";

export async function importVerifiedSalesReviewCsv(form:FormData){
 const w=await getSupplierWorkspace();
 if(!w)redirect("/supplier/sign-in");
 const storeId=form.get("storeId");
 const file=form.get("file");
 if(typeof storeId!=="string"||
  !w.stores.some(s=>s.id===storeId&&
   w.memberships.some(m=>m.supplier_id===s.supplier_id&&
    ["owner","manager"].includes(m.role)))){
  redirect("/supplier/reports/reconcile?result=unauthorized");
 }
 if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".csv")||
  file.size===0||file.size>250000){
  redirect("/supplier/reports/reconcile?result=invalid");
 }
 let parsed;
 try{
  parsed=parseSalesReviewImport(await file.text(),storeId);
 }catch{
  redirect("/supplier/reports/reconcile?result=invalid");
 }
 const importId=crypto.randomUUID();
 const {data,error}=await w.client.rpc("apply_supplier_sales_reconciliation",{
  p_store_id:storeId,p_import_id:importId,p_rows:parsed.rows,
 });
 if(error||!data||data.schema_version!==1||
  data.store_id!==storeId||
  data.processed!==parsed.uniqueOrders||
  data.duplicates_created!==0||
  data.shipping_state_modified!==false){
  redirect("/supplier/reports/reconcile?result=conflict");
 }
 redirect("/supplier/reports/reconcile?result=applied&updated="+
  String(data.updated)+"&unchanged="+String(data.unchanged)+
  "&duplicate_rows="+String(parsed.duplicatesInFile));
}
