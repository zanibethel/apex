import Link from "next/link";
import Image from "next/image";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {assessAdminMediaRelease} from "@/lib/catalog/admin-media-release-readiness.mjs";
import {privateProductMediaPath} from "@/lib/catalog/private-media-readiness.mjs";
import "./media-readiness.css";

export const dynamic="force-dynamic";
export const metadata={title:"Media Release Readiness | Apex Admin",
 robots:{index:false,follow:false}};
const LIMIT=100;
const BATCH=8;
type ReviewRecord={
 store_id:string;product_id:string;submission_id:string;
 status:string;snapshot:unknown;submitted_at:string;
};
type ImageReview={review:ReviewRecord;preview?:string;checks:ReturnType<typeof assessAdminMediaRelease>};

export default async function AdminMediaReadiness(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");

 const {data:reviews,error,count}=await client.from("private_product_review_states")
  .select("store_id,product_id,submission_id,status,snapshot,submitted_at",
    {count:"exact"})
  .order("submitted_at",{ascending:false}).limit(LIMIT);
 if(error||count===null||!reviews||reviews.length!==count||count>LIMIT)
  return <main className="container supplier-shell">
   <Link href="/admin" className="back">← Admin dashboard</Link>
   <h1>Media review unavailable</h1>
   <p className="notice">The complete authenticated private review queue could not be verified.
    No image is cleared for public release.</p>
  </main>;

 // Use only the existing admin-review snapshot, not unrestricted supplier
 // product reads (those are intentionally denied by Supabase RLS).
 const reviewed:ImageReview[]=[];
 for(let start=0;start<reviews.length;start+=BATCH){
  const segment=reviews.slice(start,start+BATCH);
  const batch=await Promise.all(segment.map(async review=>{
   const snap=review.snapshot;
   const imagePath=snap&&typeof snap==="object"&&!Array.isArray(snap)&&
    "image_path" in snap&&typeof snap.image_path==="string"
     ?snap.image_path:null;
   const valid=imagePath?privateProductMediaPath(
    review.store_id,review.product_id,imagePath):null;
   const signed=valid?await client.storage.from("apex-draft-product-images")
    .createSignedUrl(valid.path,90):null;
   const preview=signed&&!signed.error?signed.data?.signedUrl:undefined;
   return {review,preview,
    checks:assessAdminMediaRelease(review,Boolean(preview))};
  }));
  reviewed.push(...batch);
 }
 const privatePreviews=reviewed.filter(r=>r.checks.checks.some(c=>
  c.key==="private_preview_accessible"&&c.passed)).length;
 const approvedInternally=reviewed.filter(r=>r.checks.checks.some(c=>
  c.key==="content_review_approved"&&c.passed)).length;
 return <main className="container supplier-shell apex-admin-media">
  <Link href="/admin" className="back">← Admin dashboard</Link>
  <p className="eyebrow">APEX / PRIVATE ADMIN / MEDIA RELEASE</p>
  <h1>Image release readiness</h1>
  <p className="lead">Inspect submitted, supplier-specific private product images
   against their existing content-review snapshots before planning public assets.</p>
  <p className="notice"><strong>No public images are approved by this page.</strong>
   An uploaded picture or internal content approval is not proof of its identity,
   publishing rights, product eligibility, or current product revision.
   This page cannot change records, publish assets, or enable checkout.</p>
  <div className="apex-admin-media-summary" role="status">
   <span><strong>{reviewed.length}</strong> submitted review records</span>
   <span><strong>{privatePreviews}</strong> private images accessible</span>
   <span><strong>{approvedInternally}</strong> content approvals</span>
   <span><strong>0</strong> public media approvals made here</span>
  </div>
  {reviewed.length===0?<section className="supplier-panel">
   <h2>No submitted product reviews</h2>
   <p className="notice">Suppliers must first complete private product drafts,
    attach accurate images and submit their product content for review.</p>
   <Link className="button secondary" href="/admin/product-reviews">
    Open product review queue
   </Link>
  </section>
  :<div className="apex-admin-media-grid">
   {reviewed.map(({review,preview,checks})=>{
    const s=review.snapshot&&typeof review.snapshot==="object"&&
     !Array.isArray(review.snapshot)
     ?review.snapshot as Record<string,unknown>:{};
    const name=typeof s.name==="string"&&s.name.trim()?s.name:"Submitted private product";
    const sku=typeof s.sku==="string"&&s.sku.trim()?s.sku:"Not supplied";
    return <article className="apex-admin-media-card"
      key={review.store_id+":"+review.product_id}>
     <div className="apex-admin-media-image">
      {preview?<Image src={preview} alt={"Private submitted image for "+name}
        width={480} height={300} unoptimized
        style={{width:"100%",height:"100%",objectFit:"contain"}}/>
       :<span>Private review image unavailable</span>}
      <span>ADMIN VIEW · NOT PUBLIC</span>
     </div>
     <div className="apex-admin-media-body">
      <h2>{name}</h2>
      <p className="notice">SKU: {sku}</p>
      <p className="notice">Internal content status: <strong>{review.status==="approved_internal"
       ?"Approved internally":review.status==="pending_review"?"Pending review":
       review.status==="changes_requested"?"Changes requested":"Unverified"}</strong></p>
      <details className="apex-admin-media-checklist">
       <summary>Review all image release checks</summary>
       <ul>
        {checks.checks.map(c=><li key={c.key}>
         <span aria-hidden="true">{c.passed?"✓":"○"}</span>
         <span>{c.label}: <strong>{c.passed?"Recorded":"Not verified"}</strong></span>
        </li>)}
       </ul>
      </details>
      <p className="notice">Current product revision, image accuracy,
       copyright permission, seller/product authorization and immutable
       public hosting still require separate evidence and approval.</p>
      <Link className="button secondary" href="/admin/product-reviews">
       Open private content review
      </Link>
     </div>
    </article>;
   })}
  </div>}
  <section className="supplier-panel" style={{maxWidth:"none",marginTop:24}}>
   <h2>Next media release requirements</h2>
   <p className="notice">Obtain product-specific photographs or documented
    manufacturer images, confirm reuse rights, independently verify product
    identity and public-listing eligibility, and record an immutable media
    version and revocation path. The current private image bucket must remain
    private. Approved public delivery requires a separate reviewed workflow.</p>
   <div className="actions">
    <Link href="/admin/product-reviews" className="button secondary">Private content reviews</Link>
    <Link href="/admin/listing-controls" className="button secondary">Listing holds</Link>
    <Link href="/admin/checkout-readiness" className="button secondary">Checkout gates</Link>
   </div>
  </section>
 </main>;
}
