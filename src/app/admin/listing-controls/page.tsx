import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {listingControlStatus,listingControlAuditAction} from "@/lib/catalog/listing-control.mjs";
import {privateInventoryState} from "@/lib/catalog/private-inventory-state.mjs";
import {privateReleaseDisplay} from "@/lib/catalog/private-release-decision.mjs";
import {formatReviewTime} from "@/lib/catalog/review-time.mjs";
import {latestPendingSupplierCorrection} from "@/lib/catalog/listing-resubmission.mjs";
import {AdminListingOverrideForm} from "./form";

export const dynamic="force-dynamic";
export const metadata={title:"Listing Controls | Apex",robots:{index:false,follow:false}};
export default async function ListingControlsPage(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");
 const {data:controls,error}=await client.from("supplier_listing_controls")
  .select("store_id,product_id,product_name,product_sku,supplier_wants_listing,admin_gate,republish_approval_required,republish_approved,reason,changed_at")
  .order("changed_at",{ascending:false}).limit(100);
 const {data:inventory,error:inventoryError}=await client.from("inventory_items")
  .select("store_id,product_id,quantity_on_hand,quantity_reserved")
  .limit(250);
 const stockByProduct=new Map((inventoryError?[]:inventory??[]).map(row=>[
  row.store_id+":"+row.product_id,row,
 ]));
 // Review readiness per listed product; no public API or service-role read.
 const releaseDecisions=new Map<string,unknown>();
 await Promise.all((controls??[]).map(async item=>{
  const {data,error:readinessError}=await client.rpc("get_private_release_readiness",{
   p_store_id:item.store_id,p_product_id:item.product_id,
  });
  if(!readinessError&&data)
    releaseDecisions.set(item.store_id+":"+item.product_id,data);
 }));
 const {data:events,error:historyError}=await client.from("supplier_listing_events")
  .select("id,store_id,product_id,action,reason,created_at")
  .order("id",{ascending:false}).limit(500);
 return <main className="container supplier-shell apex-review-queue">
  <Link href="/admin" className="back">← Admin dashboard</Link>
  <p className="eyebrow">APEX / PRIVATE LISTING CONTROLS</p>
  <h1>Supplier publishing and admin overrides</h1>
  <p className="notice">Publication intent is private. No listing is publicly visible until separate eligibility checks, image delivery, and authorized release controls are enabled.</p>
  {error?<p role="status">Listing controls unavailable. The reviewed schema may not be installed yet.</p>
   :!controls?.length?<p>No supplier publication requests or administrative holds yet.</p>
   :<div className="apex-product-grid">
    {controls.map(item=>{
     const status=listingControlStatus(item);
     const stock=privateInventoryState(stockByProduct.get(item.store_id+":"+item.product_id));
     const decision=privateReleaseDisplay(releaseDecisions.get(item.store_id+":"+item.product_id));
     const ownEvents=(events??[]).filter(e=>e.store_id===item.store_id&&e.product_id===item.product_id).slice(0,10);
     const pendingCorrection=!historyError&&["hold","review"].includes(status.kind)
      ?latestPendingSupplierCorrection(ownEvents):null;
     return <article key={item.store_id+":"+item.product_id} className="apex-product-card">
      <div className="apex-product-card-head">
       <span className="eyebrow">{status.label}</span>
       <h2>{item.product_name||"Private product"}</h2>
      </div>
      <p className="notice">SKU {item.product_sku} · Updated {formatReviewTime(item.changed_at)}</p>
      {pendingCorrection&&<div role="status" className="apex-review-note apex-admin-pending-corrections">
       <strong>Supplier corrections awaiting review.</strong>
       <p>{pendingCorrection.note||"The supplier submitted corrections without an explanatory note."}</p>
       {pendingCorrection.createdAt&&<p className="notice">Submitted {formatReviewTime(pendingCorrection.createdAt)}</p>}
       <p className="notice">Review the saved private product evidence before unlocking. Submission alone never authorizes publication.</p>
      </div>}
      <p className="notice"><strong>Private inventory:</strong> {stock.label}</p>
      <p className="notice"><strong>Effective release decision:</strong> {decision.label}</p>
      <p className="notice">{decision.description}</p>
      {item.reason&&<p className="apex-review-note"><strong>Latest admin note:</strong> {item.reason}</p>}
      <AdminListingOverrideForm storeId={item.store_id} productId={item.product_id} gate={item.admin_gate}/>
      <details className="apex-card-editor">
       <summary>Listing-control history</summary>
       {historyError?<p role="status">Event history unavailable.</p>
       :ownEvents.length===0?<p>No recorded actions.</p>
       :<ol className="apex-review-timeline">{ownEvents.map(event=>
         <li key={event.id} className="apex-review-timeline-item">
          <strong>{listingControlAuditAction(event.action)}</strong>
          <span className="apex-review-event-meta">{formatReviewTime(event.created_at)}</span>
          {event.reason&&<p className="apex-review-event-note">{event.reason}</p>}
         </li>)}</ol>}
      </details>
     </article>;
    })}
   </div>}
  <p className="notice">An administrative hold takes priority over any supplier publication preference. A release never automatically republishes or activates commerce.</p>
 </main>;
}
