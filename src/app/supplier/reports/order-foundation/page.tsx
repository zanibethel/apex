import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {parseSupplierOrderDetailFoundation}
 from "@/lib/supplier/order-detail-foundation.mjs";

export const dynamic="force-dynamic";
export const metadata={
 title:"Order Details | Apex Supplier",robots:{index:false,follow:false},
};
export default async function OrderDetailFoundationPage(){
 const workspace=await getSupplierWorkspace();
 if(!workspace)redirect("/supplier/sign-in");
 const stores=await Promise.all(workspace.stores.map(async store=>{
  const {data,error}=await workspace.client.rpc(
   "get_supplier_order_detail_foundation",{p_store_id:store.id});
  return {store,details:error?null:
   parseSupplierOrderDetailFoundation(data,store.id)};
 }));
 return <main className="container supplier-shell">
  <Link className="back" href="/supplier/reports">← Supplier reports</Link>
  <p className="eyebrow">APEX / SUPPLIER / ORDER RECORDS</p>
  <h1>Order detail readiness</h1>
  <p className="lead">Order records preserve an original purchase reference,
   timestamp, and purchased item details. Protected destination records
   are stored separately. These records are not yet available for
   fulfillment or shipping.</p>
  {stores.map(({store,details})=><section className="supplier-panel"
   key={store.id} style={{maxWidth:"none",marginBottom:18}}>
   <h2>{store.display_name}</h2>
   {!details?<p role="alert">Order detail readiness is unavailable.
    No counts or customer information will be estimated.</p>:<>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12}}>
     <article className="supplier-panel" style={{padding:16}}>
      <span className="eyebrow">Order records</span>
      <p style={{fontSize:30,fontWeight:700,margin:"8px 0 0"}}>{details.orders}</p>
     </article>
     <article className="supplier-panel" style={{padding:16}}>
      <span className="eyebrow">Recorded line items</span>
      <p style={{fontSize:30,fontWeight:700,margin:"8px 0 0"}}>{details.lines}</p>
     </article>
     <article className="supplier-panel" style={{padding:16}}>
      <span className="eyebrow">Protected destinations</span>
      <p style={{fontSize:30,fontWeight:700,margin:"8px 0 0"}}>{details.destinationsSealed}</p>
     </article>
    </div>
    <p className="notice">Order ingestion is not active. Delivery addresses
     are not exposed on this screen. Label purchases, checkout, and shipment
     tracking are not available from these records.</p>
   </>}
  </section>)}
  <p className="notice">This is a readiness view only. Recorded sales history
   remains separate from purchase line-item snapshots and fulfillment.
   Shipment management and tracking are planned as a later, independently
   authorized feature.</p>
  <div className="actions">
   <Link className="button secondary"
    href="/supplier/reports/order-foundation/headers">
    View original held-order records</Link>
   <Link className="button secondary" href="/supplier/reports/daily">
    Daily order reports</Link>
   <Link className="button secondary" href="/supplier/reports/reconcile">
    Verified sales review</Link>
  </div>
 </main>;
}
