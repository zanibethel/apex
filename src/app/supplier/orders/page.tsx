import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {parseSupplierHeldOrderHeaders} from "@/lib/supplier/held-order-header-projection.mjs";
import {parseSupplierOrderDetailFoundation}
 from "@/lib/supplier/order-detail-foundation.mjs";
import {parseSupplierUspsReadiness}
 from "@/lib/supplier/daily-order-report.mjs";
import {
 SUPPLIER_ORDER_VIEW_LIMIT,summarizeSupplierOperations,
 recordedOrderObservation,
} from "@/lib/supplier/supplier-order-operations.mjs";
import "./orders.css";

export const dynamic="force-dynamic";
export const metadata={
 title:"Orders & Fulfillment | Apex Supplier",
 robots:{index:false,follow:false},
};

function dateCentral(value:string){
 return new Date(value).toLocaleString("en-US",{
  timeZone:"America/Chicago",dateStyle:"medium",timeStyle:"short",
 });
}
const uspsLabel:Record<string,string>={
 not_connected:"Not connected",
 pending_authorization:"Authorization pending",
 verified:"Supplier authorization recorded",
};
export default async function SupplierOrdersHub(){
 const w=await getSupplierWorkspace();
 if(!w)redirect("/supplier/sign-in");
 const results=await Promise.all(w.stores.map(async store=>{
  const [headersResult,detailsResult,uspsResult]=await Promise.all([
   w.client.rpc("get_supplier_held_order_headers",{
    p_store_id:store.id,p_limit:SUPPLIER_ORDER_VIEW_LIMIT,p_offset:0,
   }),
   w.client.rpc("get_supplier_order_detail_foundation",{p_store_id:store.id}),
   w.client.rpc("get_supplier_usps_readiness",{p_store_id:store.id}),
  ]);
  const headers=headersResult.error?null:parseSupplierHeldOrderHeaders(
   headersResult.data,store.id,{limit:SUPPLIER_ORDER_VIEW_LIMIT,offset:0});
  const details=detailsResult.error?null:parseSupplierOrderDetailFoundation(
   detailsResult.data,store.id);
  const usps=uspsResult.error?null:parseSupplierUspsReadiness(
   uspsResult.data,store.id);
  return {store,headers,summary:summarizeSupplierOperations(headers,details,usps)};
 }));
 return <main className="container supplier-shell apex-supplier-orders">
  <Link href="/supplier" className="back">← Supplier workspace</Link>
  <p className="eyebrow">APEX / SUPPLIER / OPERATIONS</p>
  <h1>Orders &amp; fulfillment</h1>
  <p className="lead">One place to find original order records, daily reporting,
   export history, and supplier shipping setup.</p>
  <div className="apex-orders-primary-links" aria-label="Supplier order tools">
   <Link className="button primary" href="/supplier/reports/daily">Daily reports</Link>
   <Link className="button secondary" href="/supplier/reports/cumulative-csv">Download / compare CSV</Link>
   <Link className="button secondary" href="/supplier/usps">USPS setup</Link>
   <Link className="button secondary" href="/supplier/reports/reconcile">Sales reconciliation</Link>
  </div>
  <p className="apex-orders-warning" role="note">Orders shown here are held for independent
   verification. A recorded sale—even one marked confirmed—does not authorize a
   label, shipment, payment, delivery-address access, or fulfillment update.</p>
  {results.map(({store,headers,summary})=><section key={store.id}
   className="apex-orders-store" aria-label={"Orders for "+store.display_name}>
   <div className="apex-orders-store-heading">
    <div>
     <p className="eyebrow">SUPPLIER STOREFRONT</p>
     <h2>{store.display_name}</h2>
    </div>
    <span className="apex-orders-held-chip">Fulfillment held</span>
   </div>
   {!summary?<p role="alert">Could not verify this store&apos;s order
    sources. Nothing has been changed or cleared for shipping.</p>:<>
    <div className="apex-orders-metrics">
     <div><span>Original held orders</span>
      <strong>{summary.held===null?"Unavailable":summary.held}</strong></div>
     <div><span>Order line snapshots</span>
      <strong>{summary.recordedLineSnapshots===null?
       "Unavailable":summary.recordedLineSnapshots}</strong></div>
     <div><span>Protected destinations</span>
      <strong>{summary.sealedDeliveryRecords===null?
       "Unavailable":summary.sealedDeliveryRecords}</strong></div>
     <div><span>USPS account</span>
      <strong className="apex-orders-usps-state">{summary.uspsStatus===null?
       "Unavailable":uspsLabel[summary.uspsStatus]}</strong></div>
    </div>
    <div className="apex-orders-subheader">
     <div>
      <h3>Original order records</h3>
      <p className="notice">Latest {SUPPLIER_ORDER_VIEW_LIMIT} held records, if available.
       Original order references remain stable across daily reports and exports.</p>
     </div>
     <Link className="button secondary"
      href="/supplier/reports/shipment-review">Review all held records</Link>
    </div>
    {!headers?<p role="alert">Original held-order records could not be
     verified. No orders or shipping status will be inferred.</p>:
     headers.total===0?<p role="status" className="apex-orders-empty">
      No original held orders have been recorded for this supplier.</p>:
     <div className="apex-orders-record-list">
      {headers.orders.map(order=><article key={order.id}
       className="apex-orders-record">
       <div className="apex-orders-reference">
        <strong>{order.reference}</strong>
        <span className="apex-orders-held-chip">Held · not shippable</span>
       </div>
       <div className="apex-orders-record-data">
        <p><span>Original date</span><strong>{dateCentral(order.purchasedAt)} CT</strong></p>
        <p><span>Recorded sale observation</span>
         <strong>{recordedOrderObservation(order.recordedSaleState)}</strong></p>
        <p><span>Stored line count</span><strong>{order.storedLineCount}</strong></p>
        <p><span>Protected destination</span>
         <strong>{order.destinationSealed?"Sealed · not accessible":"Not recorded"}</strong></p>
       </div>
      </article>)}
     </div>}
    <p className="notice">Shipping status: <strong>Not authorized</strong>.
     USPS labels and tracking entry remain disabled. Suppliers can review
     original records, export reports, and prepare their USPS account here.</p>
   </>}
  </section>)}
  <section className="apex-orders-next">
   <h2>Supplier workflow</h2>
   <div className="apex-orders-next-grid">
    <div><strong>1. Review orders</strong>
     <p>Match original order references with independently verified payment
      evidence before fulfillment.</p></div>
    <div><strong>2. Choose fulfillment</strong>
     <p>Once eligible orders are authorized, the supplier chooses what
      to fulfill, quantities, and shipping method.</p></div>
    <div><strong>3. Report and reconcile</strong>
     <p>Use original IDs in cumulative reports. Repeated exports never
      mean a second order.</p></div>
   </div>
   <p className="notice">This is an operational review workspace, not a live
    shipment queue. No customer address, shipping label, tracking number,
    payment authorization, or shipping action is exposed.</p>
  </section>
 </main>;
}
