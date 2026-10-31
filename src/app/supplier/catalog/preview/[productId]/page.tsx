import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";
import {draftSetupSteps} from "@/lib/catalog/draft-content-checklist.mjs";
import {listingControlStatus} from "@/lib/catalog/listing-control.mjs";
import {privateReleaseDisplay} from "@/lib/catalog/private-release-decision.mjs";
import {OfferTile} from "@/components/catalog/offer-tile";
import {SupplierListingControls} from "../../listing-control-form";

export const dynamic="force-dynamic";
export const metadata={title:"Preview Offer | Apex Supplier",robots:{index:false,follow:false}};

export default async function SupplierOfferPreview({params}:{params:Promise<{productId:string}>}){
 const {productId}=await params;
 if(!isValidId(productId))notFound();
 const client=await createSupplierServerClient();
 if(!client)redirect("/supplier/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!auth.user||auth.user.is_anonymous||!auth.user.email_confirmed_at)
  redirect("/supplier/sign-in");
 const {data:memberships,error:memberError}=await client.from("supplier_memberships")
  .select("supplier_id,role").limit(20);
 if(memberError||!memberships?.length)notFound();

 // Member RLS controls the product read, and an explicit supplier-to-store
 // membership check prevents direct-link preview access across tenants.
 const {data:product,error:productError}=await client.from("products")
  .select("id,store_id,category_id,sku,name,description,price_cents,compare_at_price_cents,image_path,currency,is_active,is_published")
  .eq("id",productId).maybeSingle();
 if(productError||!product)notFound();
 const {data:store,error:storeError}=await client.from("stores")
  .select("id,supplier_id,is_public,display_name")
  .eq("id",product.store_id).maybeSingle();
 if(storeError||!store)notFound();
 const member=memberships.find(m=>m.supplier_id===store.supplier_id);
 if(!member)notFound();
 const canWrite=process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true"&&
  !product.is_published&&!store.is_public&&
  (member.role==="owner"||member.role==="manager");

 const [categoryResult,inventoryResult,listingResult,decisionResult]=await Promise.all([
  product.category_id?client.from("categories").select("name")
   .eq("store_id",store.id).eq("id",product.category_id).maybeSingle()
   :Promise.resolve({data:null,error:null}),
  client.from("inventory_items").select("quantity_on_hand,quantity_reserved")
   .eq("store_id",store.id).eq("product_id",product.id).maybeSingle(),
  client.from("supplier_listing_controls")
   .select("supplier_wants_listing,admin_gate,republish_approval_required,republish_approved,reason")
   .eq("store_id",store.id).eq("product_id",product.id).maybeSingle(),
  client.rpc("get_private_release_readiness",{
   p_store_id:store.id,p_product_id:product.id,
  }),
 ]);
 const inventory=inventoryResult.error?null:inventoryResult.data;
 const setup=draftSetupSteps({...product,price_cents:Number(product.price_cents)},inventory);
 const availableStock=Math.max(0,Number(inventory?.quantity_on_hand??0)-
   Number(inventory?.quantity_reserved??0));
 const listing=listingResult.error?null:listingResult.data;
 const listingStatus=listingControlStatus(listing);
 const release=privateReleaseDisplay(decisionResult.error?null:decisionResult.data);

 let imageUrl:string|undefined;
 if(product.image_path){
  const {data,error}=await client.storage.from("apex-draft-product-images")
   .createSignedUrl(product.image_path,90);
  if(!error&&data?.signedUrl)imageUrl=data.signedUrl;
 }

 const missing=setup.steps.filter(item=>!item.complete);
 const category=categoryResult.error?"Uncategorized":categoryResult.data?.name??"Uncategorized";
 const canRequest=canWrite&&setup.setupComplete&&!listingResult.error&&
  !decisionResult.error&&listingStatus.canRequest;
 return <main className="container supplier-shell apex-offer-preview-page">
  <Link className="back" href="/supplier/catalog">← Product manager</Link>
  <p className="eyebrow">APEX / SUPPLIER OFFER PREVIEW</p>
  <h1>Preview your offer</h1>
  <p className="lead">See the customer-facing tile before publishing. This page and its image remain private to your supplier team.</p>
  <div className="apex-offer-preview-grid">
   <div className="apex-offer-preview-main">
    <div className="apex-preview-label"><span>Storefront-style preview</span><strong>PRIVATE PREVIEW</strong></div>
    <OfferTile name={product.name} sku={product.sku}
     description={product.description} category={category}
     priceCents={Number(product.price_cents)}
     compareAtCents={product.compare_at_price_cents==null?null:Number(product.compare_at_price_cents)}
     currency={product.currency} imageUrl={imageUrl} availableStock={availableStock}/>
   </div>
   <section className="apex-offer-publish-panel" aria-label="Publish offer">
    <p className="eyebrow">FINAL STEP</p>
    <h2>Publish your offer</h2>
    <p className="apex-offer-publish-state">{listingResult.error?"Status unavailable":listingStatus.label}</p>
    {!setup.setupComplete&&<div className="apex-offer-missing" role="status">
     <strong>Finish {missing.length} {missing.length===1?"detail":"details"} first</strong>
     <p>{missing.map(item=>item.label).join(", ")}</p>
     <Link className="button secondary" href={`/supplier/catalog#details-${product.id}`}>Edit product details</Link>
     <Link className="button secondary" href="/supplier/inventory">Manage inventory</Link>
    </div>}
    {listing?.reason&&<p className="notice"><strong>Admin note:</strong> {listing.reason}</p>}
    <SupplierListingControls storeId={store.id} productId={product.id}
     canEdit={canWrite&&setup.setupComplete&&!listingResult.error&&!decisionResult.error}
     wantsListing={listing?.supplier_wants_listing??false} canRequest={canRequest}
     publishLabel="Publish"/>
    <details className="apex-offer-release-details">
     <summary>Why isn&apos;t this visible to customers yet?</summary>
     <strong>{release.label}</strong>
     <p>{release.description}</p>
     <p>Publishing currently saves a supplier request. The public catalog remains disabled until the separate release and eligibility checks are completed.</p>
    </details>
    <Link href={`/supplier/catalog#details-${product.id}`} className="apex-offer-edit-link">Edit listing</Link>
   </section>
  </div>
 </main>;
}
