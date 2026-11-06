import {randomUUID} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {
 isSupplierOrderId,parseSupplierHeldOrderRecord,
} from "@/lib/supplier/held-order-record.mjs";
import {recordedOrderObservation} from "@/lib/supplier/supplier-order-operations.mjs";
import {parseSupplierHeldOrderLines} from "@/lib/supplier/held-order-line-review.mjs";
import {
 canReviewHeldShipmentPlans,parseHeldShipmentPlans,parseShipmentPlanPage,
} from "@/lib/supplier/held-shipment-plans.mjs";
import {HeldOrderLineReview} from "./held-order-line-review";
import {HeldShipmentPlanHistory} from "./held-shipment-plan-history";
import "../orders.css";

export const dynamic="force-dynamic";
export const metadata={
 title:"Held Order Review | Apex Supplier",
 robots:{index:false,follow:false},
};
const central=(date:string)=>new Date(date).toLocaleString("en-US",{
 timeZone:"America/Chicago",dateStyle:"medium",timeStyle:"short",
});

export default async function SupplierHeldOrderDetail({
 params,searchParams,
}:{
 params:Promise<{orderId:string}>,
 searchParams:Promise<{store?:string|string[];plans?:string|string[]}>,
}){
 const workspace=await getSupplierWorkspace();
 if(!workspace)redirect("/supplier/sign-in");
 const {orderId}=await params;
 const query=await searchParams;
 const storeId=typeof query.store==="string"?query.store:null;
 // Require both a valid immutable order ID and a store currently assigned
 // to this signed-in supplier. Do not accept a client-provided store as proof.
 const store=isSupplierOrderId(orderId)&&isSupplierOrderId(storeId)?
  workspace.stores.find(s=>s.id===storeId):undefined;
 const response=store?await workspace.client.rpc(
  "get_supplier_held_order_record",{
   p_store_id:store.id,p_order_id:orderId,
  }):null;
 const order=store&&response&&!response.error?
  parseSupplierHeldOrderRecord(response.data,store.id,orderId):null;
 // Only query immutable purchase-time lines after the original order record
 // and its assigned supplier identity have both been verified.
 const lineRequest=store&&order?workspace.client.rpc(
  "get_supplier_held_order_lines",{
   p_store_id:store.id,p_order_id:order.id,
  }):null;
 const planPage=parseShipmentPlanPage(query.plans);
 const canReviewPlans=store&&canReviewHeldShipmentPlans(workspace.memberships,store.supplier_id);
 const planRequest=store&&order&&canReviewPlans?workspace.client.rpc(
  "get_supplier_held_shipment_plans_v1",{
   p_store_id:store.id,p_order_id:order.id,p_page:planPage,
  }):null;
 const [lineResponse,planResponse]=await Promise.all([lineRequest,planRequest]);
 const lines=store&&order&&lineResponse&&!lineResponse.error?
  parseSupplierHeldOrderLines(lineResponse.data,store.id,order.id,
   order.storedLineCount):null;
 const shipmentPlans=store&&order&&lines&&planResponse&&!planResponse.error?
  parseHeldShipmentPlans(planResponse.data,store.id,order.id,planPage,lines.lines):null;
 return <main className="container supplier-shell apex-supplier-orders">
  <Link className="back" href="/supplier/orders">← Orders &amp; Fulfillment</Link>
  <p className="eyebrow">APEX / SUPPLIER / ORDER REVIEW</p>
  <h1>Original order record</h1>
  <p className="lead">Review the original purchase and plan quantities for internal review.
   Shipment stays disabled while the order is held.</p>
  {!store||!order?<section className="apex-orders-store" role="alert">
   <h2>Order record unavailable</h2>
   <p>The order could not be verified for your assigned supplier storefront.
    No order, delivery, payment, or shipping information has been disclosed.</p>
   <Link className="button secondary" href="/supplier/orders">Back to orders</Link>
  </section>:<section className="apex-orders-store" aria-label={"Held order "+order.reference}>
   <div className="apex-orders-store-heading">
    <div>
     <p className="eyebrow">{store.display_name}</p>
     <h2 style={{overflowWrap:"anywhere"}}>{order.reference}</h2>
    </div>
    <span className="apex-orders-held-chip">Held · not shippable</span>
   </div>
   <div className="apex-orders-record-data apex-orders-record-detail-grid">
    <p><span>Original order ID</span><strong>{order.id}</strong></p>
    <p><span>Original purchase date</span>
     <strong>{central(order.purchasedAt)} CT</strong></p>
    <p><span>Recorded sale observation</span>
     <strong>{recordedOrderObservation(order.recordedSaleState)}</strong></p>
    <p><span>Saved line snapshots</span>
     <strong>{order.storedLineCount}</strong></p>
    <p><span>Protected delivery record</span>
     <strong>{order.destinationSealed?"Sealed, not accessible":"Not recorded"}</strong></p>
    <p><span>Recorded history consistency</span>
     <strong>{order.sourceHistoryMatched?"Matches original stored sale":"Unavailable"}</strong></p>
   </div>
   <p className="apex-orders-warning" role="note">The saved sale identity
    matches the original history. This is not independent payment settlement,
    product authorization, or permission to pack, ship, decrypt addresses,
    purchase labels, or enter tracking.</p>
   {lines?<HeldOrderLineReview key={order.id}
    lines={[...lines.lines]} planForm={shipmentPlans?{
     storeId:store.id,orderId:order.id,requestId:randomUUID(),
     reviewRevision:shipmentPlans.reviewRevision,
     plannedQuantities:shipmentPlans.plannedQuantities,
    }:undefined}/>:
    <p className="apex-orders-warning" role="alert">
     Original purchased lines cannot be verified right now.
     No details or fulfillment permissions have been inferred.
    </p>}
   {lines&&shipmentPlans&&<HeldShipmentPlanHistory review={shipmentPlans} lines={lines.lines}
    storeId={store.id} orderId={order.id} actorId={workspace.user.id}/>}
   {lines&&canReviewPlans&&!shipmentPlans&&<p className="apex-orders-warning" role="alert">
    Saved shipment plans are temporarily unavailable. Quantities can still be previewed.
   </p>}
   {lines&&!canReviewPlans&&<p className="notice">Owners and managers can save and review shipment plans.</p>}
   <div className="actions">
    <Link className="button secondary" href="/supplier/reports/cumulative-csv">
     Download / compare original IDs</Link>
    <Link className="button secondary" href="/supplier/reports/daily">
     Review daily report</Link>
    <Link className="button secondary" href="/supplier/orders">
     Back to orders</Link>
   </div>
  </section>}
 </main>;
}
