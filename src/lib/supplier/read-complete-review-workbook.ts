import "server-only";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {parseSupplierReviewFulfillmentQueue}
 from "@/lib/supplier/review-fulfillment-queue.mjs";
import {buildCumulativeReviewWorkbook}
 from "@/lib/supplier/cumulative-fulfillment-review-csv.mjs";

const PAGE_SIZE=10;
const MAX_PAGES=10;
/** Complete, independently parsed held-order snapshot, or no result. */
export async function readCompleteReviewWorkbook(
 client:NonNullable<Awaited<ReturnType<typeof getSupplierWorkspace>>>["client"],
 storeId:string,day:string,
){
 const pages=[];
 for(let i=0;i<MAX_PAGES;i++){
  const offset=i*PAGE_SIZE;
  const {data,error}=await client.rpc(
   "get_supplier_review_fulfillment_queue",{
    p_store_id:storeId,p_limit:PAGE_SIZE,p_offset:offset,
   });
  if(error)return null;
  const page=parseSupplierReviewFulfillmentQueue(data,storeId,{
   limit:PAGE_SIZE,offset,
  });
  if(!page)return null;
  pages.push(page);
  if(!page.hasMore)break;
 }
 if(!pages.length||pages.at(-1)?.hasMore)return null;
 try{
  return buildCumulativeReviewWorkbook(pages,storeId,day);
 }catch{
  return null;
 }
}
