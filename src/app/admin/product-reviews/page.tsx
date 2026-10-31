import Link from "next/link";
import Image from "next/image";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {internalReviewLabel} from "@/lib/catalog/private-review-utils.mjs";
import {formatReviewTime} from "@/lib/catalog/review-time.mjs";
import {groupReviewHistory,reviewEventLabel,reviewEventActorLabel,reviewHistoryKey} from "@/lib/catalog/review-history.mjs";
import {ProductReviewDecisionForm} from "./form";

export const dynamic="force-dynamic";
export const metadata={title:"Private Product Reviews | Apex",robots:{index:false,follow:false}};

type Snapshot={
 name?:string;sku?:string;description?:string;
 category_id?:string;image_path?:string;price_cents?:number;
 is_active?:boolean;quantity_on_hand?:number;quantity_reserved?:number;
};
type HistoryEvent={
 id:number;store_id:string;product_id:string;event_type:string;
 actor_id:string|null;note:string|null;snapshot:unknown;created_at:string;
};
function snapshot(value:unknown):Snapshot {
 return value&&typeof value==="object"&&!Array.isArray(value)?value as Snapshot:{};
}

export default async function ProductReviewsPage(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");
 const {data:reviews,error}=await client.from("private_product_review_states")
   .select("store_id,product_id,submission_id,status,snapshot,submitted_at,review_note,decided_at")
   .order("submitted_at",{ascending:false}).limit(100);

 // A bounded, read-only query uses the existing RLS-protected event ledger.
 // Never return history from a service-role client or combine suppliers by SKU.
 const visibleProductIds=[...new Set((reviews??[]).map(row=>row.product_id))];
 const historyResult=visibleProductIds.length
   ?await client.from("private_product_review_history")
      .select("id,store_id,product_id,submission_id,event_type,actor_id,note,snapshot,created_at",{count:"exact"})
      .in("product_id",visibleProductIds)
      .order("created_at",{ascending:false}).order("id",{ascending:false})
      .limit(500)
   :{data:[],error:null,count:0};
 const historyByProduct=groupReviewHistory(historyResult.data,20);
 const historyTruncated=(historyResult.count??0)>500;

 // Only a trusted signed-in platform admin can request a short-lived image URL.
 // Storage RLS independently limits access to the exact image snapshotted on a
 // submitted private review; these links never turn the bucket public.
 const previews=new Map<string,string>();
 await Promise.all((reviews??[]).filter(row=>Boolean(snapshot(row.snapshot).image_path))
   .map(async row=>{
     const path=snapshot(row.snapshot).image_path;
     if(!path)return;
     const {data,error:imageError}=await client.storage
       .from("apex-draft-product-images").createSignedUrl(path,90);
     if(!imageError&&data?.signedUrl)previews.set(row.product_id,data.signedUrl);
   }));
 const counts={
   pending:(reviews??[]).filter(r=>r.status==="pending_review").length,
   approved:(reviews??[]).filter(r=>r.status==="approved_internal").length,
   needsChanges:(reviews??[]).filter(r=>r.status==="changes_requested").length,
 };

 return <main className="container supplier-shell apex-review-queue">
  <Link href="/admin" className="back">← Admin dashboard</Link>
  <p className="eyebrow">APEX / PRIVATE CATALOG REVIEWS</p>
  <h1>Product review queue</h1>
  <p className="lead">Review submitted product content and request corrections. Internal approval is not regulatory clearance or storefront publication.</p>
  {!error&&<div className="apex-review-summary" aria-label="Internal review counts">
   <span><strong>{counts.pending}</strong> Pending</span>
   <span><strong>{counts.needsChanges}</strong> Changes requested</span>
   <span><strong>{counts.approved}</strong> Approved internally</span>
  </div>}
  {error?<section className="supplier-panel">
    <h2>Review records unavailable</h2>
    <p className="notice">The private review schema must be installed on the existing Apex database before this queue can load.</p>
   </section>
   :!reviews?.length?<p className="notice">No products have been submitted for review.</p>
   :<div className="apex-product-grid">
    {reviews.map(item=>{
      const s=snapshot(item.snapshot);
      const pending=item.status==="pending_review";
      const approved=item.status==="approved_internal";
      const changeRequested=item.status==="changes_requested";
      const imageUrl=previews.get(item.product_id);
      const history=(historyByProduct.get(reviewHistoryKey(item.store_id,item.product_id))??[]) as HistoryEvent[];
      return <article key={item.product_id} className="apex-product-card">
       <div className="apex-product-card-head">
        <span className="eyebrow">{internalReviewLabel(item.status)}</span>
        <h2>{s.name??"Unnamed draft"}</h2>
       </div>
       {imageUrl?
         <div className="apex-review-image">
          <Image src={imageUrl} alt={"Private submitted image for "+(s.name??"product")}
           width={480} height={320} unoptimized/>
         </div>
         :<div className="apex-review-image-placeholder">Private image preview unavailable</div>}
       <p>SKU: {s.sku??"—"}</p>
       <p className="notice">Submitted {formatReviewTime(item.submitted_at)}</p>
       {item.decided_at&&<p className="notice">Decision {formatReviewTime(item.decided_at)}</p>}
       <p className="notice">Private product · Price {typeof s.price_cents==="number"?(s.price_cents/100).toFixed(2):"—"} USD · Stock {s.quantity_on_hand??"—"}</p>
       <details className="apex-card-editor">
        <summary>View submitted product details</summary>
        <p className="notice">{s.description??"No description supplied."}</p>
        <p className="notice">Image saved: {s.image_path?"Yes (private)":"No"}</p>
        <p className="notice">Category selected: {s.category_id?"Yes":"No"}</p>
       </details>
       {item.review_note&&<p className="apex-review-note"><strong>{changeRequested?"Changes needed":"Review note"}:</strong> {item.review_note}</p>}
       <details className="apex-review-history" aria-label={"Review history for "+(s.name??"product")}>
        <summary>Review history {historyResult.error?"· unavailable":"· "+history.length+" recent events"}</summary>
        {historyResult.error
          ?<p className="notice" role="status">Review history could not be loaded. Refresh to retry; no audit records were changed.</p>
          :history.length===0
          ?<p className="notice">No recorded review events for this product.</p>
          :<ol className="apex-review-timeline">
            {history.map(event=>{
              const previous=snapshot(event.snapshot);
              return <li key={event.id} className="apex-review-timeline-item">
                <strong>{reviewEventLabel(event.event_type)}</strong>
                <span className="apex-review-event-meta">
                  {formatReviewTime(event.created_at)} · {reviewEventActorLabel(event.event_type,event.actor_id)}
                </span>
                {event.note&&<p className="apex-review-event-note">{event.note}</p>}
                <details className="apex-review-event-snapshot">
                  <summary>Submitted details at this event</summary>
                  <p className="notice">SKU: {previous.sku??"—"} · Price: {typeof previous.price_cents==="number"?(previous.price_cents/100).toFixed(2)+" USD":"—"} · Stock: {previous.quantity_on_hand??"—"}</p>
                  <p className="notice">Image on record: {previous.image_path?"Yes (private)":"No"}</p>
                </details>
              </li>;
            })}
          </ol>}
        {!historyResult.error&&historyTruncated&&<p className="notice">Showing a limited recent event history; older entries may not appear.</p>}
        {!historyResult.error&&history.length===20&&<p className="notice">Showing the latest 20 events for this product.</p>}
       </details>
       {pending?<ProductReviewDecisionForm storeId={item.store_id}
        productId={item.product_id} submissionId={item.submission_id}/>
        :approved?<p className="apex-review-outcome">Internal content approved. No further decision is required unless product details change. This listing is not publicly available.</p>
        :<p className="apex-review-outcome">Awaiting supplier changes and resubmission. There is no pending decision for this draft.</p>}
      </article>;
    })}
   </div>}
  <p className="notice">This page cannot change product publication, store visibility, checkout or payments. Times shown in Central time.</p>
 </main>;
}
