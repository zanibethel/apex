import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";
import {draftSetupSteps} from "@/lib/catalog/draft-content-checklist.mjs";
import {listingControlStatus} from "@/lib/catalog/listing-control.mjs";
import {privateReleaseDisplay} from "@/lib/catalog/private-release-decision.mjs";
import {OfferTile} from "@/components/catalog/offer-tile";
import {BulkPublishPanel} from "../../bulk-publish-panel";

export const dynamic="force-dynamic";
export const metadata={title:"Preview Saved Offers | Apex",robots:{index:false,follow:false}};

export default async function BulkOfferPreview({searchParams}:{
 searchParams:Promise<{all?:string;ids?:string}>;
}){
 const query=await searchParams;
 const requestedIds=typeof query.ids==="string"&&query.ids.length<3000
  ?query.ids.split(",").filter(Boolean):[];
 const showAll=query.all==="1";
 if(!showAll&&(!requestedIds.length||requestedIds.length>50||
   requestedIds.some(id=>!isValidId(id))||new Set(requestedIds).size!==requestedIds.length))
   notFound();

 const client=await createSupplierServerClient();
 if(!client)redirect("/supplier/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!auth.user||auth.user.is_anonymous||!auth.user.email_confirmed_at)
  redirect("/supplier/sign-in");
 const {data:memberships,error:memberError}=await client.from("supplier_memberships")
  .select("supplier_id,role").in("role",["owner","manager"]).limit(20);
 if(memberError||!memberships?.length)notFound();
 const {data:stores,error:storeError}=await client.from("stores")
  .select("id,supplier_id,is_public").in("supplier_id",memberships.map(m=>m.supplier_id))
  .eq("is_public",false).limit(20);
 if(storeError||!stores||stores.length!==1)notFound();
 const store=stores[0];
 let productQuery=client.from("products")
  .select("id,store_id,sku,name,description,category_id,price_cents,compare_at_price_cents,currency,image_path,is_active,is_published")
  .eq("store_id",store.id).eq("is_published",false);
 if(!showAll)productQuery=productQuery.in("id",requestedIds);
 const {data:products,error:productError}=await productQuery.order("name").limit(50);
 if(productError||(!showAll&&(!products||products.length!==requestedIds.length)))notFound();
 const ids=(products??[]).map(p=>p.id);
 const [cats,stocks,controls]=await Promise.all([
  client.from("categories").select("id,name").eq("store_id",store.id).limit(100),
  ids.length?client.from("inventory_items")
   .select("product_id,quantity_on_hand,quantity_reserved")
   .eq("store_id",store.id).in("product_id",ids):Promise.resolve({data:[],error:null}),
  ids.length?client.from("supplier_listing_controls")
   .select("product_id,supplier_wants_listing,admin_gate,republish_approval_required,republish_approved,reason")
   .eq("store_id",store.id).in("product_id",ids):Promise.resolve({data:[],error:null}),
 ]);
 const categoryNames=new Map((cats.data??[]).map(c=>[c.id,c.name]));
 const stock=new Map((stocks.data??[]).map(i=>[i.product_id,i]));
 const control=new Map((controls.data??[]).map(c=>[c.product_id,c]));
 const decision=new Map<string,unknown>();
 const imageUrls=new Map<string,string>();
 await Promise.all((products??[]).map(async p=>{
  const [{data,error},previewImage]=await Promise.all([
   client.rpc("get_private_release_readiness",{
    p_store_id:store.id,p_product_id:p.id,
   }),
   p.image_path?client.storage.from("apex-draft-product-images")
    .createSignedUrl(p.image_path,90):Promise.resolve({data:null,error:null}),
  ]);
  if(!error&&data)decision.set(p.id,data);
  if(!previewImage.error&&previewImage.data?.signedUrl)
   imageUrls.set(p.id,previewImage.data.signedUrl);
 }));
 const canEdit=process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true";
 const previews=(products??[]).map(p=>{
  const inventory=stock.get(p.id);
  const setup=draftSetupSteps({...p,price_cents:Number(p.price_cents)},inventory);
  const c=control.get(p.id);
  const status=listingControlStatus(c);
  return {product:p,setup,stockAvailable:Math.max(0,Number(inventory?.quantity_on_hand??0)-Number(inventory?.quantity_reserved??0)),
   category:categoryNames.get(p.category_id??"")??"Uncategorized",
   imageUrl:imageUrls.get(p.id),status,controls:c,
   release:privateReleaseDisplay(decision.get(p.id)),
   canRequest:canEdit&&setup.setupComplete&&!controls.error&&decision.has(p.id)&&status.canRequest};
 });

 return <main className="container supplier-shell apex-bulk-preview-page">
  <Link className="back" href="/supplier/catalog/bulk">← Bulk editor</Link>
  <p className="eyebrow">APEX / PRIVATE OFFER REVIEW</p>
  <h1>{showAll?"Preview all saved offers":"Preview selected offers"}</h1>
  <p className="lead">Review the same offer-tile layout customers will eventually see. These previews and images are accessible only to your supplier team.</p>
  <p className="notice">Offer previews are not public listings. Publishing below records private supplier intent, subject to admin holds and authorization requirements.</p>
  {showAll&&previews.length===50&&<p className="notice">Showing the first 50 saved products. Publish in batches of up to 50.</p>}
  {!previews.length?<p role="status">No saved products available to preview. Add products in the bulk editor first.</p>
   :<>
    <div className="apex-offer-gallery">
     {previews.map(item=><div className="apex-offer-gallery-item" key={item.product.id}>
      <OfferTile name={item.product.name} sku={item.product.sku} category={item.category}
       description={item.product.description} priceCents={Number(item.product.price_cents)}
       compareAtCents={item.product.compare_at_price_cents==null?null:Number(item.product.compare_at_price_cents)}
       currency={item.product.currency} imageUrl={item.imageUrl} availableStock={item.stockAvailable}/>
      <div className="apex-offer-gallery-meta">
       <p><strong>{item.status.label}</strong></p>
       <p className="notice">{item.setup.completed}/{item.setup.total} setup details</p>
       <details><summary>Release check: {item.release.label}</summary>
        <p>{item.release.description}</p></details>
       <Link className="button secondary" href={"/supplier/catalog/preview/"+item.product.id}>Preview single / Publish single</Link>
      </div>
     </div>)}
    </div>
    <BulkPublishPanel storeId={store.id} editable={canEdit}
     products={previews.map(item=>({id:item.product.id,name:item.product.name,
      canRequest:item.canRequest,wantsListing:item.controls?.supplier_wants_listing??false}))}/>
   </>}
 </main>;
}
