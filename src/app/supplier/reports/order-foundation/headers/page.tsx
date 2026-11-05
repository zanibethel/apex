import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {parseSupplierHeldOrderHeaders}
 from "@/lib/supplier/held-order-header-projection.mjs";
import {parseHeldHeaderPage,heldHeaderPageHref,
 HELD_HEADER_PAGE_SIZE,HELD_HEADER_LAST_PAGE}
 from "@/lib/supplier/held-order-header-page.mjs";

export const dynamic="force-dynamic";
export const metadata={
 title:"Held Order Records | Apex Supplier",
 robots:{index:false,follow:false},
};

const originalDate=(utc:string)=>new Date(utc).toLocaleString("en-US",{
 timeZone:"America/Chicago",dateStyle:"medium",timeStyle:"short",
});
const recordedSaleLabel=(state:string)=>({
 confirmed:"Recorded as confirmed (not independently settled)",
 pending:"Recorded as pending",
 refunded:"Recorded as refunded",
 cancelled:"Recorded as cancelled",
}[state]??"Recorded state unavailable");

export default async function SupplierHeldOrderHeaders({
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
  return {store,headers};
 }));
 return <main className="container supplier-shell">
  <Link className="back" href="/supplier/reports/order-foundation">
   ← Order detail readiness
  </Link>
  <p className="eyebrow">APEX / SUPPLIER / HELD RECORDS</p>
  <h1>Original order records</h1>
  <p className="lead">Review the original references, recorded purchase
   dates, and limited record status for your assigned storefronts.
   These are held records, not independently verified transactions or
   orders authorized for shipment.</p>
  {results.map(({store,headers})=><section key={store.id}
   className="supplier-panel" style={{maxWidth:"none",marginBottom:18}}>
   <h2>{store.display_name}</h2>
   {!headers?<p role="alert">Order records are unavailable for this
    storefront. No information is estimated if supplier permissions
    or record integrity cannot be verified.</p>:
    <>
     <p className="notice">
      {headers.total} held record{headers.total===1?"":"s"} on file
      {" · "}Page {page+1}.
      Customer destinations, item details, prices, and payment
      credentials are not available on this page.
     </p>
     {headers.total===0?<p role="status">
      No original held-order records have been captured.
      Nothing is ready for fulfillment.
     </p>:headers.orders.length===0?<p role="status">
      No records on this page. Select Previous page to see
      earlier results.
     </p>:
     <div style={{display:"grid",gap:12}}>
      {headers.orders.map(order=><article className="supplier-panel"
       key={order.id} style={{maxWidth:"none",padding:16}}>
       <div style={{display:"flex",gap:12,flexWrap:"wrap",
        alignItems:"baseline",justifyContent:"space-between"}}>
        <strong style={{overflowWrap:"anywhere"}}>{order.reference}</strong>
        <span className="eyebrow">HELD — REVIEW ONLY</span>
       </div>
       <dl style={{display:"grid",gap:10,
        gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",
        marginTop:12}}>
        <div><dt className="eyebrow">Original recorded date</dt>
         <dd style={{margin:0}}>{originalDate(order.purchasedAt)}
          {" "}Central</dd></div>
        <div><dt className="eyebrow">Recorded sale observation</dt>
         <dd style={{margin:0}}>{recordedSaleLabel(order.recordedSaleState)}
         </dd></div>
        <div><dt className="eyebrow">Saved line count</dt>
         <dd style={{margin:0}}>{order.storedLineCount}
          {" "}(not independently reconciled)</dd></div>
        <div><dt className="eyebrow">Protected destination record</dt>
         <dd style={{margin:0}}>{order.destinationSealed?
          "Sealed record exists":"No sealed record on file"}</dd></div>
       </dl>
       <p className="notice" style={{marginTop:12}}>
        Payment unverified for release · Shipping disabled ·
        Destination details unavailable
       </p>
      </article>)}
     </div>}
     <nav className="actions" style={{marginTop:16}}
      aria-label={"Held-order record pages for "+store.display_name}>
      {page>0?<Link className="button secondary"
       href={heldHeaderPageHref(page-1)}>Previous page</Link>:null}
      {headers.hasMore&&page<HELD_HEADER_LAST_PAGE?
       <Link className="button secondary"
        href={heldHeaderPageHref(page+1)}>Next page</Link>:null}
     </nav>
    </>}
  </section>)}
  <p className="notice">This is a metadata-only, read-only view.
   It does not provide purchased items, delivery addresses, shipping
   labels, tracking actions, or payment settlement authority. Recorded
   sale status is not proof of independent payment finality.</p>
  <div className="actions">
   <Link className="button secondary"
    href="/supplier/reports/order-foundation">Order readiness overview</Link>
   <Link className="button secondary"
    href="/supplier/reports">Sales reports</Link>
  </div>
 </main>;
}
