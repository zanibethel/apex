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

export async function importCumulativeReviewNotes(form:FormData){
 const workspace=await getSupplierWorkspace();
 if(!workspace)return redirect(target+"?upload=unavailable");
 const storeId=form.get("storeId");
 const requestId=form.get("requestId");
 const file=form.get("file");
 if(typeof storeId!=="string"||typeof requestId!=="string")
  return redirect(target+"?upload=invalid");
 if(!UUID.test(storeId)||!UUID.test(requestId))
  return redirect(target+"?upload=invalid");
 if(!(file instanceof File))return redirect(target+"?upload=invalid");
 if(!file.name.toLowerCase().endsWith(".csv")||
  file.size===0||file.size>750000)
  return redirect(target+"?upload=invalid");

 const store=workspace.stores.find(s=>s.id===storeId);
 if(!store||!workspace.memberships.some(m=>
  m.supplier_id===store.supplier_id&&
  (m.role==="owner"||m.role==="manager")))
  return redirect(target+"?upload=unavailable");

 const today=centralDateKey(new Date());
 if(!today)return redirect(target+"?upload=unavailable");
 const report=await readCompleteReviewWorkbook(
  workspace.client,storeId,today);
 if(!report)return redirect(target+"?upload=unavailable");

 const {data:annotData,error:annotError}=await workspace.client.rpc(
  "get_supplier_cumulative_review_annotations",{
   p_store_id:storeId,
  });
 if(annotError)return redirect(target+"?upload=unavailable");
 const annotation=parseAnnotationSnapshot(annotData,storeId);
 const current=annotation?mergeAnnotationSnapshot(
  report.rows,storeId,annotation):null;
 if(!current)return redirect(target+"?upload=unavailable");

 let changes:null|ReturnType<typeof buildReviewAnnotationUploadChanges>=null;
 try{
  const preview=previewCumulativeReviewImport(
   await file.text(),current,storeId);
  if(preview.status==="preview_only"&&preview.conflicts===0){
   changes=buildReviewAnnotationUploadChanges(preview,current,storeId);
  }
 }catch{
  return redirect(target+"?upload=invalid");
 }
 if(!changes)return redirect(target+"?upload=conflict");
 if(changes.length===0)return redirect(target+"?upload=unchanged");

 const {data:receiptData,error:writeError}=await workspace.client.rpc(
  "apply_supplier_cumulative_review_annotations",{
   p_store_id:storeId,p_request_id:requestId,p_changes:changes,
  });
 if(writeError)return redirect(target+"?upload=conflict");
 const result=parseAnnotationReceipt(receiptData,storeId,changes.length);
 if(!result)return redirect(target+"?upload=unavailable");
 revalidatePath(target);
 return redirect(target+"?upload="+(
  result.status==="identical_import_replay"?"replayed":"saved"));
}
