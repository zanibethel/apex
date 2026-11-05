import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {parseSupplierHeldOrderHeaders}
 from "@/lib/supplier/held-order-header-projection.mjs";
import {parseHeldHeaderPage,HELD_HEADER_PAGE_SIZE,HELD_HEADER_LAST_PAGE}
 from "@/lib/supplier/held-order-header-page.mjs";
import {summarizeHeldShipmentReview,shipmentReviewHref}
 from "@/lib/supplier/shipment-review-summary.mjs";

export const dynamic="force-dynamic";
export const metadata={
 title:"Held-Order Review | Apex Supplier",
 robots:{index:false,follow:false},
};

const showDate=(value:string)=>new Date(value).toLocaleString("en-US",{
 timeZone:"America/Chicago",dateStyle:"medium",timeStyle:"short",
});
const recordedStatus=(state:string)=>({
 confirmed:"Confirmed in recorded sales history — not proof of settlement",
 pending:"Pending in recorded sales history",
 refunded:"Refunded in recorded sales history",
 cancelled:"Cancelled in recorded sales history",
}[state]??"Recorded state unavailable");

export default async function ShipmentReviewPage({
 searchParams,
}:{
 searchParams:Promise<{page?:string|string[]}>,
}){
 const workspace=await getSupplierWorkspace();
 if(!workspace)redirect("/supplier/sign-in");
 const params=await searchParams;
 const page=parseHeldHeaderPage(params?.page);
 const offset=page*HELD_HEADER_PAGE_SIZE;
 const results=await Promise.all(workspace.stores.map(async store=>{
  const {data,error}=await workspace.client.rpc(
   "get_supplier_held_order_headers",{
    p_store_id:store.id,p_limit:HELD_HEADER_PAGE_SIZE,p_offset:offset,
   });
  const headers=error?null:parseSupplierHeldOrderHeaders(
   data,store.id,{limit:HELD_HEADER_PAGE_SIZE,offset},
  );
  const summary=headers?summarizeHeldShipmentReview(headers,store.id):null;
  return {store,headers:summary?headers:null,summary};
 }));
 return <main className="container supplier-shell">
  <Link className="back" href="/supplier/reports">← Supplier reports</Link>
  <p className="eyebrow">APEX / SUPPLIER / HELD-ORDER REVIEW</p>
  <h1>Shipment review foundation</h1>
  <p className="lead">This workspace lists original order headers held
   for independent review. It is not an operational shipping queue.
   A recorded sale status does not establish payment finality,
   shipment eligibility, or delivery authorization.</p>
  {results.map(({store,headers,summary})=><section key={store.id}
   className="supplier-panel" style={{maxWidth:"none",marginBottom:18}}>
   <h2>{store.display_name}</h2>
   {!headers||!summary?<p role="alert">
    Held-order review is unavailable for this storefront.
    Supplier access or record integrity could not be verified.
    No shipping readiness will be inferred.
   </p>:<>
    <div style={{display:"grid",gap:12,
     gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))"}}>
     <article className="supplier-panel" style={{padding:16}}>
      <p className="eyebrow">Original held records</p>
      <strong style={{fontSize:28}}>{summary.totalHeld}</strong>
     </article>
     <article className="supplier-panel" style={{padding:16}}>
      <p className="eyebrow">Records on this page</p>
      <strong style={{fontSize:28}}>{summary.pageRecords}</strong>
     </article>
     <article className="supplier-panel" style={{padding:16}}>
      <p className="eyebrow">Independently eligible</p>
      <strong style={{fontSize:28}}>0</strong>
     </article>
    </div>
    <p className="notice">
     Page {page+1} · Review indicators on this page:
     {" "}{summary.pageMissingLineSnapshots} without stored line snapshots,
     {" "}{summary.pageMissingSealedDestinations} without a sealed
     destination record. These are metadata observations only,
     not shipping approvals.
    </p>
    {headers.total===0?<p role="status">
     No held-order records available for review.
     No packages or shipments are authorized from this source.
    </p>:headers.orders.length===0?<p role="status">
     No records on this page. Use Previous page to view
     an earlier page.
    </p>:
    <div style={{display:"grid",gap:12}}>
     {headers.orders.map(order=><article className="supplier-panel"
      key={order.id} style={{maxWidth:"none",padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",
       flexWrap:"wrap",alignItems:"baseline",gap:10}}>
       <strong style={{overflowWrap:"anywhere"}}>{order.reference}</strong>
       <span className="eyebrow">HELD — NOT READY TO SHIP</span>
      </div>
      <dl style={{display:"grid",gap:12,marginTop:12,
       gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))"}}>
       <div><dt className="eyebrow">Original record date</dt>
        <dd style={{margin:0}}>{showDate(order.purchasedAt)}
         {" "}Central</dd></div>
       <div><dt className="eyebrow">Recorded sale observation</dt>
        <dd style={{margin:0}}>{recordedStatus(order.recordedSaleState)}
        </dd></div>
       <div><dt className="eyebrow">Saved line count</dt>
        <dd style={{margin:0}}>{order.storedLineCount}
         {" "}(not independently reconciled)</dd></div>
       <div><dt className="eyebrow">Protected destination record</dt>
        <dd style={{margin:0}}>{order.destinationSealed?
         "Sealed record exists":"No sealed record stored"}</dd></div>
      </dl>
      <p className="notice" style={{marginTop:12}}>
       Source unverified · Payment not authorized · Shipment not authorized
      </p>
     </article>)}
    </div>}
    <nav className="actions" aria-label={"Review pages for "+store.display_name}
     style={{marginTop:16}}>
     {page>0?<Link className="button secondary"
      href={shipmentReviewHref(page-1)}>Previous page</Link>:null}
     {headers.hasMore&&page<HELD_HEADER_LAST_PAGE?
      <Link className="button secondary"
       href={shipmentReviewHref(page+1)}>Next page</Link>:null}
    </nav>
   </>}
  </section>)}
  <p className="notice">This page does not provide shipping addresses,
   purchased item details, labels, tracking entry, shipment confirmation,
   email dispatch, or payment processing. Those actions remain gated.</p>
  <div className="actions">
   <Link className="button secondary"
    href="/supplier/reports/order-foundation/headers">
    Original held-order records
   </Link>
   <Link className="button secondary" href="/supplier/reports">
    Sales history
   </Link>
  </div>
 </main>;
}
