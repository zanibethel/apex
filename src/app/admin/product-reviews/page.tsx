import Link from "next/link";
import Image from "next/image";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {internalReviewLabel} from "@/lib/catalog/private-review-utils.mjs";
import {formatReviewTime} from "@/lib/catalog/review-time.mjs";
import {ProductReviewDecisionForm} from "./form";

export const dynamic="force-dynamic";
export const metadata={title:"Private Product Reviews | Apex",robots:{index:false,follow:false}};

type Snapshot={
 name?:string;sku?:string;description?:string;
 category_id?:string;image_path?:string;price_cents?:number;
 is_active?:boolean;quantity_on_hand?:number;quantity_reserved?:number;
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
