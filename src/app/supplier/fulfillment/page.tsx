import Link from "next/link";
import {randomUUID} from "node:crypto";
import {ReviewTrackingDraftForm} from "./review-tracking-draft-form";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {parseSupplierReviewFulfillmentQueue}
 from "@/lib/supplier/review-fulfillment-queue.mjs";

export const dynamic="force-dynamic";
export const metadata={
 title:"Fulfillment Queue | Apex Supplier",
 robots:{index:false,follow:false},
};

const PAGE_SIZE=10;
const centralTime=(value:string)=>new Date(value).toLocaleString("en-US",{
 timeZone:"America/Chicago",dateStyle:"medium",timeStyle:"short",
});
export default async function SupplierFulfillmentQueue({
 searchParams,
}:{
 searchParams:Promise<{page?:string}>,
}){
 const workspace=await getSupplierWorkspace();
 if(!workspace)redirect("/supplier/sign-in");
 const query=await searchParams;
 const raw=typeof query?.page==="string"?query.page:"0";
 const page=/^(0|[1-9]\d?)$/.test(raw)&&Number(raw)<=100?Number(raw):0;
 const offset=page*PAGE_SIZE;
 const results=await Promise.all(workspace.stores.map(async store=>{
  const {data,error}=await workspace.client.rpc(
   "get_supplier_review_fulfillment_queue",{
    p_store_id:store.id,p_limit:PAGE_SIZE,p_offset:offset,
   });
  return {store,queue:error?null:parseSupplierReviewFulfillmentQueue(
   data,store.id,{limit:PAGE_SIZE,offset},
  ),canEdit:workspace.memberships.some(m=>m.supplier_id===store.supplier_id&&
   (m.role==="owner"||m.role==="manager"))};
 }));
 return <main className="container supplier-shell">
  <Link className="back" href="/supplier">← Supplier workspace</Link>
  <p className="eyebrow">APEX / SUPPLIER / FULFILLMENT</p>
  <h1>Fulfillment queue</h1>
  <p className="lead">Review original purchased quantities, shipment plans
   and draft tracking references for your assigned storefront. Planning
   quantities do not mean items have shipped or been delivered.</p>
  {results.map(({store,queue,canEdit})=><section key={store.id}
   className="supplier-panel" style={{maxWidth:"none",marginBottom:20}}>
   <h2>{store.display_name}</h2>
   {!queue?<p role="alert">Fulfillment queue records are unavailable.
    No shipments or tracking information will be inferred.</p>:
    <>
     <p className="notice">{queue.total} order
      {queue.total===1?" record":" records"} available for review.
      Delivery addresses, label purchasing, carrier validation and
      shipping actions remain disabled. Authorized suppliers may record
      review-only tracking drafts when the isolated service is available.</p>
     {!queue.orders.length?<p role="status">
      No records on this page.</p>:
      <div style={{display:"grid",gap:14}}>
       {queue.orders.map(order=><details key={order.id}
        className="supplier-panel"
        style={{maxWidth:"none",padding:16}}>
        <summary style={{cursor:"pointer"}}>
         <strong>{order.reference}</strong>
         {" · "}{centralTime(order.purchasedAt)} Central
         {" · "}{order.readiness==="incomplete"?
          "Source details incomplete":"Review only — not shipped"}
        </summary>
        <div style={{marginTop:12}}>
         {order.readiness==="incomplete"?
          <p role="status">Original purchase lines, totals or protected
           destination evidence are incomplete. This record cannot be
           planned or treated as ready for shipment.</p>:
          <>
           <div style={{display:"grid",
            gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",
            gap:12}}>
            <article className="supplier-panel" style={{padding:12}}>
             <span className="eyebrow">Purchased units</span>
             <p style={{fontSize:26,fontWeight:700,margin:"6px 0 0"}}>
              {order.purchasedUnits}</p>
            </article>
            <article className="supplier-panel" style={{padding:12}}>
             <span className="eyebrow">Allocated to plans</span>
             <p style={{fontSize:26,fontWeight:700,margin:"6px 0 0"}}>
              {order.plannedUnits}</p>
            </article>
            <article className="supplier-panel" style={{padding:12}}>
             <span className="eyebrow">Not yet planned</span>
             <p style={{fontSize:26,fontWeight:700,margin:"6px 0 0"}}>
              {order.unplannedUnits}</p>
            </article>
           </div>
           <h3 style={{marginTop:20}}>Purchased items and planning</h3>
           <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",minWidth:570}}>
             <thead><tr>
              <th scope="col">Item</th><th scope="col">SKU</th>
              <th scope="col">Purchased</th>
              <th scope="col">Planned</th>
              <th scope="col">Unplanned</th>
             </tr></thead>
             <tbody>{order.lines.map(line=><tr key={line.number}>
              <td>{line.title}{line.variant?
               <small style={{display:"block"}}>{line.variant}</small>:null}</td>
              <td>{line.sku}</td>
              <td>{line.purchased}</td><td>{line.planned}</td>
              <td>{line.unplanned}</td>
             </tr>)}</tbody>
            </table>
           </div>
           <h3 style={{marginTop:20}}>Shipment plans</h3>
           {!order.plans.length?<p className="notice">
            No shipment plans recorded. Purchased units remain unplanned.</p>:
            <div style={{display:"grid",gap:12}}>
             {order.plans.map(plan=><article key={plan.id}
              className="supplier-panel"
              style={{maxWidth:"none",padding:14}}>
              <strong>{plan.reference}</strong>
              <p className="notice">{plan.plannedUnits} planned
               {" · "}Revision {plan.revision}
               {" · "}Review only, not shipped</p>
              {!plan.drafts.length?<p className="notice">
               No tracking draft recorded.</p>:
               <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",minWidth:460}}>
                 <thead><tr>
                  <th scope="col">Carrier draft</th>
                  <th scope="col">Tracking draft</th>
                  <th scope="col">Recorded</th>
                 </tr></thead>
                 <tbody>{plan.drafts.map(draft=><tr key={draft.revision}>
                  <td>{draft.carrier}</td>
                  <td>{draft.reference}</td>
                  <td>{centralTime(draft.recordedAt)} Central</td>
                 </tr>)}</tbody>
                </table>
               </div>}
              {canEdit?<ReviewTrackingDraftForm
               storeId={store.id} shipmentId={plan.id}
               revision={plan.revision} requestId={randomUUID()}/>:null}
             </article>)}
            </div>}
           <p className="notice">A recorded tracking reference is a
            draft only. This page cannot print labels, decrypt delivery
            information, or mark any order shipped.</p>
          </>}
        </div>
       </details>)}
      </div>}
     <div className="actions" style={{marginTop:18}}>
      {page>0&&<Link className="button secondary"
       href={"/supplier/fulfillment?page="+(page-1)}>Previous page</Link>}
      {queue.hasMore&&page<100&&<Link className="button secondary"
       href={"/supplier/fulfillment?page="+(page+1)}>Next page</Link>}
     </div>
    </>}
  </section>)}
  <p className="notice">The fulfillment ledger is separate from payments.
   Draft entry is restricted to a disposable review environment. Carrier
   verification, postage purchases, customer destination access and actual
   shipment-state changes remain disabled.</p>
  <div className="actions">
   <Link className="button secondary"
    href="/supplier/reports/order-foundation/details">
    Original order details</Link>
   <Link className="button secondary" href="/supplier/usps">
    Carrier account readiness</Link>
   <Link className="button secondary" href="/supplier/reports/fulfillment">
    Cumulative review CSV</Link>
   <Link className="button secondary" href="/supplier/reports">
    Sales history</Link>
  </div>
 </main>;
}
