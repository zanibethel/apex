import Image from "next/image";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {assessPrivateMediaReadiness,privateProductMediaPath}
 from "@/lib/catalog/private-media-readiness.mjs";
import "./media-readiness.css";

export const dynamic="force-dynamic";
export const metadata={title:"Private Product Image Readiness | Apex",
 robots:{index:false,follow:false}};

const MAX_PRODUCTS=100;

export default async function SupplierMediaReadiness(){
 const workspace=await getSupplierWorkspace();
 if(!workspace)redirect("/supplier/sign-in");
 const stores=workspace.stores.filter(s=>!s.is_public&&
  workspace.memberships.some(m=>m.supplier_id===s.supplier_id&&
   ["owner","manager"].includes(m.role)));
 if(stores.length!==1)return <main className="container supplier-shell">
  <h1>Choose one authorized private storefront.</h1>
  <p className="notice">Image inspection requires owner or manager access to one private store.</p>
  <Link href="/supplier/catalog">Back to product editor</Link>
 </main>;
 const store=stores[0];
 const [items,reviews,imports]=await Promise.all([
  workspace.client.from("products")
   .select("id,store_id,sku,name,image_path,is_published",{count:"exact"})
   .eq("store_id",store.id).eq("is_published",false)
   .order("name",{ascending:true}).limit(MAX_PRODUCTS),
  workspace.client.from("private_product_review_states")
   .select("product_id,status,snapshot").eq("store_id",store.id).limit(MAX_PRODUCTS),
  workspace.client.from("supplier_import_candidates")
   .select("id",{count:"exact",head:true}).eq("store_id",store.id)
   .neq("review_status","approved_for_draft"),
 ]);
 if(items.error||reviews.error||imports.error||
  items.count===null||items.count!==items.data?.length||
  items.count>MAX_PRODUCTS)
  return <main className="container supplier-shell">
   <Link href="/supplier/catalog" className="back">← Product editor</Link>
   <h1>Image readiness unavailable</h1>
   <p className="notice">The complete private product/image review state could not be verified. Nothing has been changed.</p>
  </main>;
 const reviewMap=new Map((reviews.data??[]).map(item=>[item.product_id,item]));
 const results=await Promise.all((items.data??[]).map(async product=>{
  const validated=privateProductMediaPath(store.id,product.id,product.image_path);
  if(!validated){
   return {product,previewUrl:undefined as string|undefined,
    readiness:assessPrivateMediaReadiness({
     pathValid:false,currentImagePath:product.image_path,
     reviewStatus:reviewMap.get(product.id)?.status,
    })};
  }
  // Private supplier owner/manager RLS: first verify the exact object exists
  // in that product's own folder. Never create a public URL or read another store.
  const {data:objects,error:listError}=await workspace.client.storage
   .from("apex-draft-product-images").list(validated.folder,{
    search:validated.file,limit:100,
   });
  const found=!listError&&Boolean(objects?.some(item=>item.name===validated.file));
  const signed=found?await workspace.client.storage.from("apex-draft-product-images")
   .createSignedUrl(validated.path,120):null;
  const previewUrl=signed&&!signed.error?signed.data?.signedUrl:undefined;
  const review=reviewMap.get(product.id);
  const snapshot=review?.snapshot;
  const snapshotImagePath=snapshot&&typeof snapshot==="object"&&!Array.isArray(snapshot)
   &&"image_path" in snapshot&&typeof snapshot.image_path==="string"
   ?snapshot.image_path:null;
  return {product,previewUrl,
   readiness:assessPrivateMediaReadiness({
    pathValid:true,objectFound:found,signedPreview:Boolean(previewUrl),
    reviewStatus:review?.status,snapshotImagePath,currentImagePath:product.image_path,
   })};
 }));
 const ready=results.filter(r=>r.readiness.privateImagePresent).length;
 const missing=results.length-ready;
 const current=results.filter(r=>r.readiness.internalContentReviewCurrent).length;
 return <main className="container supplier-shell apex-media-readiness">
  <Link href="/supplier" className="back">← Supplier dashboard</Link>
  <p className="eyebrow">APEX / PRIVATE SUPPLIER MEDIA</p>
  <h1>Product image readiness</h1>
  <p className="lead">Verify saved product-specific images before requesting
   internal review and public-gallery preparation.</p>
  <p className="notice"><strong>Private inspection only.</strong> A stored image
   is not proof that it accurately depicts the product, its identity is verified,
   or it is authorized for public use. Supplier and product sale authorization
   are independent. Nothing here changes publication or starts checkout.</p>
  <div className="apex-media-metrics" role="status">
   <span><strong>{results.length}</strong> saved private products</span>
   <span><strong>{ready}</strong> private images accessible</span>
   <span><strong>{missing}</strong> image work needed</span>
   <span><strong>{current}</strong> unchanged internal content approvals</span>
   <span><strong>{imports.count??"—"}</strong> source variants awaiting review</span>
  </div>
  {results.length===0?<section className="supplier-panel">
   <h2>No saved private products yet</h2>
   <p>Start with the supplier source review and draft creation workflows.</p>
   <Link href="/supplier/imports/bulk-review" className="button secondary">Review source variants</Link>
  </section>
  :<div className="apex-media-grid">
   {results.map(({product,previewUrl,readiness})=>{
    const label=readiness.status==="stored_privately"?"Private image accessible":
     readiness.status==="file_missing"?"Linked file not found":
     readiness.status==="invalid_path"?"Image path does not match this product":
     readiness.status==="preview_unavailable"?"Private preview not available":"Image needed";
    return <article className="apex-media-card" key={product.id}>
     <div className="apex-media-photo">
      {previewUrl?<Image src={previewUrl} width={440} height={320}
       unoptimized alt={"Private candidate image for "+product.name}
       style={{width:"100%",height:"100%",objectFit:"contain"}}/>
       :<span>Image pending</span>}
      <span className="apex-media-private">PRIVATE DRAFT</span>
     </div>
     <div className="apex-media-body">
      <h2>{product.name}</h2>
      <p className="notice">SKU: {product.sku}</p>
      <strong className="apex-media-status">{label}</strong>
      <p className="notice">Internal content review:{" "}
       {readiness.internalContentReviewCurrent?"Approved for unchanged submitted details":
        "Not currently approved for this image"}</p>
      <p className="notice"><strong>Public image clearance: Not verified.</strong>{" "}
       Confirm the exact pictured product, label, rights to use this image,
       and source documentation before any public media approval.</p>
      <div className="apex-media-actions">
       <Link href={"/supplier/catalog#image-"+product.id} className="button secondary">
        Upload or choose image</Link>
       <Link href={"/supplier/catalog/preview/"+product.id} className="button secondary">
        Preview private offer</Link>
       <Link href="/supplier/catalog" className="button secondary">
        Submit for internal review</Link>
      </div>
     </div>
    </article>;
   })}
  </div>}
  <section className="supplier-panel" style={{maxWidth:"none",marginTop:24}}>
   <h2>Next steps to complete the catalog</h2>
   <p className="notice">The shared illustration shown in imported-source
    previews is not verified imagery of every distinct compound. Assign an
    accurate image to each saved product and use the existing private admin
    content-review process for approval.</p>
   <p className="notice">After image-specific verification and independent
    supplier/product release authorization, public assets will need a separate
    approved image-hosting and mapping workflow. This page does not create
    public buckets, public URLs or payment credentials.</p>
   <div className="actions">
    <Link href="/supplier/imports/bulk-review" className="button secondary">Review imported variants</Link>
    <Link href="/supplier/imports/bulk-drafts" className="button secondary">Create reviewed drafts</Link>
    <Link href="/supplier/catalog/bulk" className="button secondary">Bulk product editor</Link>
   </div>
  </section>
 </main>;
}
