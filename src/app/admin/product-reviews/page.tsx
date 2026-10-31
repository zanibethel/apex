import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {internalReviewLabel} from "@/lib/catalog/private-review-utils.mjs";
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
 return <main className="container supplier-shell apex-review-queue">
  <Link href="/admin" className="back">← Admin dashboard</Link>
  <p className="eyebrow">APEX / PRIVATE CATALOG REVIEWS</p>
  <h1>Product review queue</h1>
  <p className="lead">Review submitted product content and request corrections. Internal approval is not regulatory clearance or storefront publication.</p>
  {error?<section className="supplier-panel">
    <h2>Review records unavailable</h2>
    <p className="notice">The private review schema must be installed on the existing Apex database before this queue can load.</p>
   </section>
   :!reviews?.length?<p className="notice">No products have been submitted for review.</p>
   :<div className="apex-product-grid">
    {reviews.map(item=>{
      const s=snapshot(item.snapshot);
      const pending=item.status==="pending_review";
      return <article key={item.product_id} className="apex-product-card">
       <div className="apex-product-card-head">
        <span className="eyebrow">{internalReviewLabel(item.status)}</span>
        <h2>{s.name??"Unnamed draft"}</h2>
       </div>
       <p>SKU: {s.sku??"—"}</p>
       <p className="notice">Submitted {new Date(item.submitted_at).toLocaleString("en-US")}</p>
       <p className="notice">Private product · Price {typeof s.price_cents==="number"?(s.price_cents/100).toFixed(2):"—"} USD · Stock {s.quantity_on_hand??"—"}</p>
       <details className="apex-card-editor">
        <summary>View submitted product details</summary>
        <p className="notice">{s.description??"No description supplied."}</p>
        <p className="notice">Image saved: {s.image_path?"Yes (private)":"No"}</p>
        <p className="notice">Category selected: {s.category_id?"Yes":"No"}</p>
       </details>
       {item.review_note&&<p className="apex-review-note"><strong>Admin note:</strong> {item.review_note}</p>}
       {pending?<ProductReviewDecisionForm storeId={item.store_id}
        productId={item.product_id} submissionId={item.submission_id}/>
        :<p className="notice">Decision recorded. Supplier may resubmit if changes were requested.</p>}
      </article>;
    })}
   </div>}
  <p className="notice">This page cannot change product publication, store visibility, checkout or payments.</p>
 </main>;
}
