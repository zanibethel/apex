import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {centralDateKey} from "@/lib/supplier/daily-order-report.mjs";
import {randomUUID} from "node:crypto";
import {readCompleteReviewWorkbook}
 from "@/lib/supplier/read-complete-review-workbook";
import {parseAnnotationSnapshot,mergeAnnotationSnapshot}
 from "@/lib/supplier/review-annotation-schema.mjs";
import CumulativeReviewWorkspace from "./workspace";

export const dynamic="force-dynamic";
export const metadata={
 title:"Cumulative Fulfillment Review | Apex Supplier",
 robots:{index:false,follow:false},
};
export default async function SupplierCumulativeFulfillmentReview({
 searchParams,
}:{
 searchParams:Promise<{upload?:string}>,
}){
 const query=await searchParams;
 const messages:Record<string,string>={
  saved:"Review annotations saved. Original orders and shipment plans were unchanged.",
  replayed:"This import was already applied. No duplicate records were created.",
  unchanged:"All uploaded review annotations already match the current records.",
  conflict:"The file contains stale or conflicting data. Refresh and download a current CSV.",
  invalid:"The CSV failed validation. Review the file and try a fresh export.",
  unavailable:"The review import service is unavailable. No changes were saved.",
 };
 const upload=typeof query?.upload==="string"?query.upload:"";
 const message=Object.hasOwn(messages,upload)?messages[upload]:null;
 const workspace=await getSupplierWorkspace();
 if(!workspace)redirect("/supplier/sign-in");
 const day=centralDateKey(new Date());
 if(!day)return <main className="container supplier-shell">
  <h1>Review reporting unavailable</h1>
 </main>;
 const data=await Promise.all(workspace.stores.map(async store=>{
  const report=await readCompleteReviewWorkbook(
   workspace.client,store.id,day,
  );
  if(!report)return {store,report:null,rows:null,
   canPreview:false,requestId:""};
  const {data:notes,error}=await workspace.client.rpc(
   "get_supplier_cumulative_review_annotations",{
    p_store_id:store.id,
   });
  const annotation=error?null:parseAnnotationSnapshot(notes,store.id);
  const rows=annotation?
   mergeAnnotationSnapshot(report.rows,store.id,annotation):null;
  return {store,report:rows?report:null,rows,
   canPreview:workspace.memberships.some(m=>
    m.supplier_id===store.supplier_id&&
    (m.role==="owner"||m.role==="manager")),
   requestId:randomUUID()};
 }));
 return <main className="container supplier-shell">
  <Link className="back" href="/supplier/reports/daily">
   ← Daily sales reports</Link>
  <p className="eyebrow">APEX / SUPPLIER / REPORT REVIEW</p>
  <h1>Cumulative fulfillment review</h1>
  {message&&<p role={["conflict","invalid","unavailable"].includes(upload)?
   "alert":"status"} className="notice">{message}</p>}
  <p className="lead">A store-specific snapshot of original held order
   references, purchased items, planned quantities and tracking drafts
   carried forward across report days. This view does not assert that
   payment cleared or that any order was shipped.</p>
  <p className="notice">Report as of {day} (America/Chicago). For a reliable
   export, every current held order must be accessible in one consistent
   supplier-scoped review snapshot. If the source changes between pages or
   exceeds the review limit of 100 orders, export is unavailable rather
   than omitting records.</p>
  {data.map(({store,report,rows,canPreview,requestId})=><section key={store.id}
   className="supplier-panel" style={{maxWidth:"none",marginBottom:18}}>
   <h2>{store.display_name}</h2>
   {!report||!rows?<p role="alert">A complete verified review snapshot is
    unavailable for this storefront. No partial CSV will be exported.
    Original fulfillment data cannot be inferred from sales totals.</p>:
    <CumulativeReviewWorkspace
     storeId={store.id} day={day} rows={rows.map(r=>({...r}))} requestId={requestId}
     totalOrders={report.totalOrders} summary={report.summary}
     canPreview={canPreview}/>}
  </section>)}
  <p className="notice">CSV review annotations can be saved only through the gated,
   supplier-authorized review ledger. This does not change orders,
   purchased quantities, payments, tracking, delivery or shipping states.</p>
  <div className="actions">
   <Link className="button secondary" href="/supplier/fulfillment">
    Fulfillment queue</Link>
   <Link className="button secondary"
    href="/supplier/reports/fulfillment/email-preview">
    Daily email & attachment preview</Link>
   <Link className="button secondary" href="/supplier/reports/reconcile">
    Sales review CSV</Link>
  </div>
 </main>;
}
