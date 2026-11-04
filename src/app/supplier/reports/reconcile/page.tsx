import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {parseVerifiedReviewRows} from "@/lib/supplier/sales-reconciliation-csv.mjs";
import SalesReconciliationWorkspace from "./workspace";
import "./reconcile.css";
export const dynamic="force-dynamic";
export const metadata={
 title:"Verified Sales Reconciliation | Apex Supplier",
 robots:{index:false,follow:false},
};
export default async function SupplierReconciliationPage({
 searchParams,
}:{searchParams:Promise<{
 result?:string;updated?:string;unchanged?:string;duplicate_rows?:string
}>}){
 const w=await getSupplierWorkspace();
 if(!w)redirect("/supplier/sign-in");
 const p=await searchParams;
 const results=await Promise.all(w.stores.map(async store=>{
  const {data,error}=await w.client.rpc("get_supplier_sales_reconciliation",{
   p_store_id:store.id,p_limit:500,
  });
  const review=error?null:parseVerifiedReviewRows(data,store.id);
  const canEdit=w.memberships.some(m=>m.supplier_id===store.supplier_id&&
   ["owner","manager"].includes(m.role));
  return {store,review,canEdit};
 }));
 return <main className="container supplier-shell apex-sales-review-page">
  <Link href="/supplier/reports" className="back">← Verified sales reports</Link>
  <p className="eyebrow">APEX / SUPPLIER / RECONCILIATION</p>
  <h1>Sales reconciliation</h1>
  <p className="lead">A verified sale keeps the same order reference and
   purchase timestamp across every downloaded report.
   Review uploads update an existing record; they never create a second order.</p>
  {p?.result==="applied"&&<p role="status" className="apex-sales-review-success">
   Import reconciled. {Number(p.updated??0)||0} review changes and
   {" "}{Number(p.unchanged??0)||0} unchanged records.
   {" "}{Number(p.duplicate_rows??0)||0} identical repeated rows ignored.
  </p>}
  {p?.result==="invalid"&&<p role="alert">
   CSV rejected. Use the current Apex template, keep source identifiers unchanged,
   and try uploading again.</p>}
  {p?.result==="conflict"&&<p role="alert">
   CSV import rejected without applying changes. A row was stale, not in your
   storefront or otherwise invalid. Download a fresh report and retry.</p>}
  {p?.result==="unauthorized"&&<p role="alert">
   Import requires current supplier owner or manager permissions.</p>}
  {results.map(({store,review,canEdit})=><section key={store.id}
   className="apex-sales-review-store">
   <h2>{store.display_name}</h2>
   {!review?<p role="alert">The verified sales review is unavailable.
    No order records will be inferred.</p>:
    <SalesReconciliationWorkspace storeId={store.id}
     rows={review.rows} total={review.total}
     truncated={review.truncated} canEdit={canEdit}/>}
  </section>)}
  <p className="notice">This is a recordkeeping and duplicate-review workflow.
   Apex does not currently store validated shipping addresses or order-line
   fulfillment records in the verified sales source. These reviews do not
   purchase USPS labels, enter tracking, or mark shipments complete.</p>
  <div className="actions">
   <Link className="button secondary" href="/supplier/reports/daily">
    Daily email reports</Link>
   <Link className="button secondary" href="/supplier/usps">
    USPS account readiness</Link>
  </div>
 </main>;
}
