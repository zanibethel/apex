import Link from "next/link";
import Image from "next/image";
import {notFound,redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";
import {ProductRowEditor} from "@/app/supplier/operations/forms";
import {ProductImageUploader} from "@/app/supplier/catalog/image-uploader";
import {SupplierListingControls} from "@/app/supplier/catalog/listing-control-form";
import {draftSetupSteps} from "@/lib/catalog/draft-content-checklist.mjs";
import {listingControlStatus} from "@/lib/catalog/listing-control.mjs";
import "../products.css";

export const dynamic="force-dynamic";
export const metadata={title:"Edit product | Apex Supplier",robots:{index:false,follow:false}};

const dollars=(cents:unknown)=>{
 const n=Number(cents);
 return Number.isSafeInteger(n)&&n>=0?(n/100).toFixed(2):"";
};

export default async function SupplierProductEdit({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!isValidId(id))notFound();
 const client=await createSupplierServerClient();
 if(!client)redirect("/supplier/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!auth.user||auth.user.is_anonymous||!auth.user.email_confirmed_at)
  redirect("/supplier/sign-in");
 const {data:memberships,error:memberError}=await client.from("supplier_memberships")
  .select("supplier_id,role").in("role",["owner","manager"]).limit(20);
 if(memberError||!memberships?.length)notFound();
 const {data:product,error:productError}=await client.from("products")
  .select("id,store_id,category_id,sku,name,description,price_cents,compare_at_price_cents,image_path,is_active,is_published")
  .eq("id",id).maybeSingle();
 if(productError||!product)notFound();
 const {data:store,error:storeError}=await client.from("stores")
  .select("id,supplier_id,is_public").eq("id",product.store_id).maybeSingle();
 if(storeError||!store||!memberships.some(m=>m.supplier_id===store.supplier_id))
  notFound();
 const canEdit=process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true"&&
  !product.is_published&&!store.is_public;
 const [categoriesResult,imagesResult,inventoryResult,listingResult,releaseResult]=await Promise.all([
  client.from("categories").select("id,name").eq("store_id",store.id).order("name").limit(120),
  client.from("products").select("id,name,sku,image_path")
   .eq("store_id",store.id).not("image_path","is",null).limit(120),
  client.from("inventory_items").select("quantity_on_hand,quantity_reserved")
   .eq("store_id",store.id).eq("product_id",product.id).maybeSingle(),
  client.from("supplier_listing_controls")
   .select("supplier_wants_listing,admin_gate,republish_approval_required,republish_approved,reason")
   .eq("store_id",store.id).eq("product_id",product.id).maybeSingle(),
  client.rpc("get_private_release_readiness",{
   p_store_id:store.id,p_product_id:product.id,
  }),
 ]);
 const categories=categoriesResult.error?[]:categoriesResult.data??[];
 const existingImages:{productId:string;name:string;sku:string;previewUrl:string}[]=[];
 if(!imagesResult.error){
  await Promise.all((imagesResult.data??[]).filter(p=>p.image_path).map(async p=>{
   const {data,error}=await client.storage.from("apex-draft-product-images")
    .createSignedUrl(p.image_path!,90);
   if(!error&&data?.signedUrl)
    existingImages.push({productId:p.id,name:p.name,sku:p.sku,previewUrl:data.signedUrl});
  }));
 }
 const productImage=existingImages.find(p=>p.productId===product.id)?.previewUrl;
 const listing=listingResult.error?null:listingResult.data;
 const setup=draftSetupSteps({...product,price_cents:Number(product.price_cents)},
  inventoryResult.error?null:inventoryResult.data);
 const status=listingControlStatus(listing);
 const canPublish=canEdit&&setup.setupComplete&&!listingResult.error&&
  !releaseResult.error&&status.canRequest;
 return <main className="container supplier-shell apex-simple-products apex-products-edit">
  <Link className="back" href="/supplier/products">← All products</Link>
  <p className="eyebrow">APEX / SUPPLIER PRODUCTS</p>
  <h1>{product.name}</h1>
  <p className="lead">Edit product details and image here. Changes are saved to
   this private supplier product without an additional administrator approval
   for ordinary draft edits.</p>
  <div className="apex-products-edit-layout">
   <section className="supplier-panel">
    <h2>Product information</h2>
    <ProductRowEditor storeId={product.store_id} productId={product.id}
     sku={product.sku} name={product.name}
     description={product.description??""}
     price={dollars(product.price_cents)}
     comparePrice={product.compare_at_price_cents==null?"":dollars(product.compare_at_price_cents)}
     isActive={product.is_active} categoryId={product.category_id}
     categories={categories} enabled={canEdit}/>
    {!canEdit&&<p className="notice">
     This record is read-only under the existing supplier edit policy.
     It cannot be changed directly from this screen.
    </p>}
   </section>
   <div>
    <section className="supplier-panel apex-products-edit-photo">
     <h2>Product photo</h2>
     {productImage?<Image src={productImage} alt={product.name}
      width={340} height={220} unoptimized
      style={{width:"100%",maxHeight:220,objectFit:"contain"}}/>:
      <div className="apex-products-image-placeholder" aria-hidden="true">▲</div>}
     <ProductImageUploader storeId={product.store_id} productId={product.id}
      enabled={canEdit} hasImage={Boolean(product.image_path)}
      existingImages={existingImages}/>
    </section>
    <section className="supplier-panel apex-products-publish">
     <h2>Storefront status</h2>
     <p className="apex-products-state">{status.label}</p>
     {listing?.reason&&<p className="notice"><strong>Admin note:</strong> {listing.reason}</p>}
     {!setup.setupComplete&&<p className="notice">
      Before requesting publication, finish: {setup.steps.filter(s=>!s.complete)
       .map(s=>s.label).join(", ")}.
     </p>}
     <SupplierListingControls storeId={product.store_id} productId={product.id}
      canEdit={canEdit&&setup.setupComplete&&!listingResult.error&&!releaseResult.error}
      canRequest={canPublish} wantsListing={listing?.supplier_wants_listing??false}
      publishLabel="Publish"/>
     <p className="notice">
      Publish records your supplier request, not a bypass of an admin hold or
      product eligibility checks. Public checkout is not activated here.
     </p>
     <Link className="button secondary" href={"/supplier/catalog/preview/"+product.id}>
      Preview product
     </Link>
    </section>
   </div>
  </div>
 </main>;
}
