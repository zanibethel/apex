import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {parseSupplierHeldOrderDetails}
 from "@/lib/supplier/held-order-detail-view.mjs";

export const dynamic="force-dynamic";
export const metadata={
 title:"Order Details | Apex Supplier",
 robots:{index:false,follow:false},
};

const PAGE_SIZE=25;
const usd=(n:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(n/100);
const purchasedAt=(utc:string)=>new Date(utc).toLocaleString("en-US",{
 timeZone:"America/Chicago",dateStyle:"medium",timeStyle:"short",
});
const recordedState=(value:string)=>({
 confirmed:"Confirmed in recorded sales history",
 pending:"Pending in recorded sales history",
 refunded:"Refunded in recorded sales history",
 cancelled:"Cancelled in recorded sales history",
}[value]??"Status unavailable");

export default async function SupplierHeldOrderDetails({
 searchParams,
}:{
 searchParams:Promise<{page?:string}>,
}){
 const workspace=await getSupplierWorkspace();
 if(!workspace)redirect("/supplier/sign-in");
 const params=await searchParams;
 const raw=typeof params?.page==="string"?params.page:"0";
 const page=/^(0|[1-9]\d?)$/.test(raw)&&Number(raw)<=40?
  Number(raw):0;
 const offset=page*PAGE_SIZE;
 const results=await Promise.all(workspace.stores.map(async store=>{
  const {data,error}=await workspace.client.rpc(
   "get_supplier_held_order_details",{
    p_store_id:store.id,p_limit:PAGE_SIZE,p_offset:offset,
   });
  return {store,details:error?null:parseSupplierHeldOrderDetails(
   data,store.id,{limit:PAGE_SIZE,offset},
  )};
 }));
 return <main className="container supplier-shell">
  <Link className="back" href="/supplier/reports/order-foundation">
   ← Order record readiness
  </Link>
  <p className="eyebrow">APEX / SUPPLIER / ORDER DETAILS</p>
  <h1>Order details</h1>
  <p className="lead">Review saved purchase references and item snapshots
   for your assigned storefront. These records remain held; a recorded sale
   status does not authorize payment collection or shipment.</p>
  {results.map(({store,details})=><section key={store.id}
   className="supplier-panel" style={{maxWidth:"none",marginBottom:20}}>
   <h2>{store.display_name}</h2>
   {!details?<p role="alert">Order details are unavailable for this
    storefront. No order information is estimated or displayed without
    verified supplier access.</p>:
    <>
     <p className="notice">{details.total} held order
      {details.total===1?" record":" records"} on file. Page {page+1}.
      Delivery information is protected and unavailable on this page.</p>
     {details.orders.length===0?<p role="status">
      No order details are available on this page.</p>:
      <div style={{display:"grid",gap:16}}>
       {details.orders.map(order=><details key={order.id}
        className="supplier-panel"
        style={{maxWidth:"none",padding:16}}>
        <summary style={{cursor:"pointer",listStyle:"revert"}}>
         <strong>{order.reference}</strong>
         {" · "}{purchasedAt(order.purchasedAt)}
         {" · "}{order.readiness==="held"?
          "Held — not authorized for shipment":"Details incomplete — review required"}
        </summary>
        <div style={{marginTop:14}}>
         <p className="notice"><strong>Original purchase:</strong>
          {" "}{purchasedAt(order.purchasedAt)} Central
          {" · "}<strong>Recorded sale state:</strong>
          {" "}{recordedState(order.recordedSaleState)}
         </p>
         {order.readiness==="incomplete"?
          <p role="status">This record does not have a complete,
           verified line-item and accounting snapshot. Purchased items
           and totals are withheld until the records reconcile.</p>:
          <>
           <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",minWidth:620}}>
             <thead><tr>
              <th scope="col">Purchased item</th>
              <th scope="col">SKU</th>
              <th scope="col">Quantity</th>
              <th scope="col">Unit price</th>
              <th scope="col">Line total</th>
             </tr></thead>
             <tbody>{order.lines.map(line=><tr key={line.number}>
              <td>{line.title}
               {line.variant?<small style={{display:"block"}}>
                {line.variant}</small>:null}</td>
              <td>{line.sku}</td>
              <td>{line.quantity}</td>
              <td>{usd(line.unitPriceCents)}</td>
              <td>{usd(line.totalCents)}</td>
             </tr>)}</tbody>
            </table>
           </div>
           {order.totals&&<div style={{marginTop:12}}>
            <p><strong>Merchandise:</strong> {usd(order.totals.subtotalCents)}</p>
            <p><strong>Shipping charge:</strong> {usd(order.totals.shippingCents)}</p>
            <p><strong>Discount:</strong> −{usd(order.totals.discountCents)}</p>
            <p><strong>Recorded gross:</strong> {usd(order.totals.grossCents)}</p>
           </div>}
           <p className="notice">Delivery details are sealed separately.
            Addresses, label purchase, fulfillment authorization, and tracking
            updates are not accessible from this record.</p>
          </>}
        </div>
       </details>)}
      </div>}
     <div className="actions" style={{marginTop:16}}>
      {page>0&&<Link className="button secondary"
       href={"/supplier/reports/order-foundation/details?page="+(page-1)}>
       Previous page</Link>}
      {details.hasMore&&page<40&&<Link className="button secondary"
       href={"/supplier/reports/order-foundation/details?page="+(page+1)}>
       Next page</Link>}
     </div>
    </>}
  </section>)}
  <p className="notice">Order information is read-only. Supplier
   fulfillment, tracking number entry, label purchasing, and delivery-address
   access require a separate authorization and are not enabled here.</p>
  <div className="actions">
   <Link className="button secondary" href="/supplier/fulfillment">Fulfillment queue</Link>
   <Link className="button secondary" href="/supplier/reports">Sales history</Link>
   <Link className="button secondary" href="/supplier/reports/daily">Daily reports</Link>
  </div>
 </main>;
}
