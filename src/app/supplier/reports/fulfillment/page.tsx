import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {centralDateKey} from "@/lib/supplier/daily-order-report.mjs";
import {parseSupplierReviewFulfillmentQueue}
 from "@/lib/supplier/review-fulfillment-queue.mjs";
import {buildCumulativeReviewWorkbook}
 from "@/lib/supplier/cumulative-fulfillment-review-csv.mjs";
import CumulativeReviewWorkspace from "./workspace";

export const dynamic="force-dynamic";
export const metadata={
 title:"Cumulative Fulfillment Review | Apex Supplier",
 robots:{index:false,follow:false},
};
const LIMIT=10;
const MAX_PAGES=10;
async function readCompleteStoreQueue(
 client:Awaited<ReturnType<typeof getSupplierWorkspace>> extends infer W
  ?NonNullable<W>["client"]:never,
 storeId:string,day:string,
){
 const pages=[];
 for(let i=0;i<MAX_PAGES;i++){
  const offset=i*LIMIT;
  const {data,error}=await client.rpc(
   "get_supplier_review_fulfillment_queue",{
    p_store_id:storeId,p_limit:LIMIT,p_offset:offset,
   });
  if(error)return null;
  const parsed=parseSupplierReviewFulfillmentQueue(data,storeId,{
   limit:LIMIT,offset,
  });
  if(!parsed)return null;
  pages.push(parsed);
  if(!parsed.hasMore)break;
 }
 if(pages.length===0||pages.at(-1)?.hasMore)return null;
 try{
  return buildCumulativeReviewWorkbook(pages,storeId,day);
 }catch{
  return null;
 }
}
export default async function SupplierCumulativeFulfillmentReview(){
 const workspace=await getSupplierWorkspace();
 if(!workspace)redirect("/supplier/sign-in");
 const day=centralDateKey(new Date());
 if(!day)return <main className="container supplier-shell">
  <h1>Review reporting unavailable</h1>
 </main>;
 const data=await Promise.all(workspace.stores.map(async store=>({
  store,
  canPreview:workspace.memberships.some(m=>
   m.supplier_id===store.supplier_id&&
   (m.role==="owner"||m.role==="manager")),
  report:await readCompleteStoreQueue(workspace.client,store.id,day),
 })));
 return <main className="container supplier-shell">
  <Link className="back" href="/supplier/reports/daily">
   ← Daily sales reports</Link>
  <p className="eyebrow">APEX / SUPPLIER / REPORT REVIEW</p>
  <h1>Cumulative fulfillment review</h1>
  <p className="lead">A store-specific snapshot of original held order
   references, purchased items, planned quantities and tracking drafts
   carried forward across report days. This view does not assert that
   payment cleared or that any order was shipped.</p>
  <p className="notice">Report as of {day} (America/Chicago). For a reliable
   export, every current held order must be accessible in one consistent
   supplier-scoped review snapshot. If the source changes between pages or
   exceeds the review limit of 100 orders, export is unavailable rather
   than omitting records.</p>
  {data.map(({store,report,canPreview})=><section key={store.id}
   className="supplier-panel" style={{maxWidth:"none",marginBottom:18}}>
   <h2>{store.display_name}</h2>
   {!report?<p role="alert">A complete verified review snapshot is
    unavailable for this storefront. No partial CSV will be exported.
    Original fulfillment data cannot be inferred from sales totals.</p>:
    <CumulativeReviewWorkspace
     storeId={store.id} day={day} rows={report.rows}
     totalOrders={report.totalOrders} summary={report.summary}
     canPreview={canPreview}/>}
  </section>)}
  <p className="notice">CSV uploads on this page are a local, read-only
   comparison. They do not update Apex, send an email, purchase shipping
   labels, save delivery details or mark orders shipped. Actual atomic
   synchronization requires a separately reviewed supplier authorization
   and persistence workflow.</p>
  <div className="actions">
   <Link className="button secondary" href="/supplier/fulfillment">
    Fulfillment queue</Link>
   <Link className="button secondary" href="/supplier/reports/reconcile">
    Sales review CSV</Link>
  </div>
 </main>;
}
