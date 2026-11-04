"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {centralDateKey} from "@/lib/supplier/daily-order-report.mjs";
import {readCompleteReviewWorkbook}
 from "@/lib/supplier/read-complete-review-workbook";
import {parseAnnotationSnapshot,mergeAnnotationSnapshot,
 parseAnnotationReceipt} from "@/lib/supplier/review-annotation-schema.mjs";
import {previewCumulativeReviewImport,buildReviewAnnotationUploadChanges}
 from "@/lib/supplier/cumulative-fulfillment-review-csv.mjs";

const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const target="/supplier/reports/fulfillment";
const navigate=(result:string):never=>redirect(target+"?upload="+result);

export async function importCumulativeReviewNotes(form:FormData){
 const workspace=await getSupplierWorkspace();
 if(!workspace)navigate("unavailable");
 const storeId=form.get("storeId");
 const requestId=form.get("requestId");
 const file=form.get("file");
 if(typeof storeId!=="string"||typeof requestId!=="string"||
  !UUID.test(storeId)||!UUID.test(requestId)||
  !(file instanceof File)||!file.name.toLowerCase().endsWith(".csv")||
  file.size===0||file.size>750000)navigate("invalid");
 const store=workspace.stores.find(s=>s.id===storeId);
 if(!store||!workspace.memberships.some(m=>
  m.supplier_id===store.supplier_id&&
  (m.role==="owner"||m.role==="manager")))navigate("unavailable");

 const today=centralDateKey(new Date());
 const report=await readCompleteReviewWorkbook(
  workspace.client,storeId,today);
 if(!report)navigate("unavailable");
 const {data:annotData,error:annotError}=await workspace.client.rpc(
  "get_supplier_cumulative_review_annotations",{
   p_store_id:storeId,
  });
 if(annotError)navigate("unavailable");
 const annotation=parseAnnotationSnapshot(annotData,storeId);
 const current=annotation?mergeAnnotationSnapshot(
  report.rows,storeId,annotation):null;
 if(!current)navigate("unavailable");
 let changes;
 try{
  const preview=previewCumulativeReviewImport(
   await file.text(),current,storeId);
  if(preview.status!=="preview_only"||preview.conflicts)navigate("conflict");
  changes=buildReviewAnnotationUploadChanges(preview,current,storeId);
 }catch(e){
  // Next redirects are exceptions; do not mask them as validation errors.
  if(e&&typeof e==="object"&&"digest" in e)throw e;
  navigate("invalid");
 }
 if(changes.length===0)navigate("unchanged");
 const {data:receiptData,error:writeError}=await workspace.client.rpc(
  "apply_supplier_cumulative_review_annotations",{
   p_store_id:storeId,p_request_id:requestId,p_changes:changes,
  });
 if(writeError)navigate("conflict");
 const result=parseAnnotationReceipt(receiptData,storeId,changes.length);
 if(!result)navigate("unavailable");
 revalidatePath(target);
 navigate(result.status==="identical_import_replay"?"replayed":"saved");
}
