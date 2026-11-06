import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {
 buildSupplierSheetCards,
} from "@/lib/catalog/supplier-products-workspace.mjs";
import {SUPPLIER_OPTION_BATCH} from "@/lib/catalog/supplier-parent-review-snapshot.mjs";
import SimpleProducts from "./simple-products";
import "./products.css";

export const dynamic="force-dynamic";
export const metadata={title:"Products | Apex Supplier",robots:{index:false,follow:false}};

const MAX_SAVED=150;
const MAX_SOURCE=250;
const MAX_EVENTS=500;

export default async function SupplierProductsPage(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/supplier/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!auth.user||auth.user.is_anonymous||!auth.user.email_confirmed_at)
  redirect("/supplier/sign-in");
 const {data:memberships,error:memberError}=await client.from("supplier_memberships")
  .select("supplier_id,role").in("role",["owner","manager"]).limit(20);
 if(memberError||!memberships?.length)return <main className="container supplier-shell">
  <h1>Supplier product access required</h1>
  <p>Sign in as an assigned supplier owner or manager.</p>
  <Link href="/supplier">Supplier home</Link>
 </main>;
 const {data:stores,error:storeError}=await client.from("stores")
  .select("id,supplier_id,display_name,is_public")
  .in("supplier_id",memberships.map(m=>m.supplier_id))
  .eq("is_public",false).limit(20);
 if(storeError||!stores||stores.length!==1)return <main className="container supplier-shell">
  <h1>Choose a single supplier storefront</h1>
  <p>Products from different suppliers are never combined.</p>
  <Link href="/supplier">Supplier home</Link>
 </main>;
 const store=stores[0];
 const [savedResult,sourceResult,eventResult,controlResult]=await Promise.all([
  client.from("products")
   .select("id,store_id,sku,name,price_cents,is_published,is_active,image_path,updated_at",{count:"exact"})
   .eq("store_id",store.id).order("name").limit(MAX_SAVED),
  client.from("apex_supplier_variant_review_items")
   .select("id,store_id,source_row,parent_title,source_name,source_section,strength,size,carrier_oil,retail_price_cents,review_status,review_note",{count:"exact"})
   .eq("store_id",store.id).eq("source_batch",SUPPLIER_OPTION_BATCH)
   .order("parent_title").order("source_row").limit(MAX_SOURCE),
  client.from("apex_supplier_parent_review_events")
   .select("id,parent_title,decision,reviewed_snapshot",{count:"exact"})
   .eq("store_id",store.id).eq("source_batch",SUPPLIER_OPTION_BATCH)
   .order("id",{ascending:false}).limit(MAX_EVENTS),
  client.from("supplier_listing_controls")
   .select("product_id,supplier_wants_listing,admin_gate,reason",{count:"exact"})
   .eq("store_id",store.id).limit(MAX_SAVED),
 ]);
 const complete=(value:{error:unknown;count:number|null;data:unknown[]|null},max:number)=>
  !value.error&&value.count!==null&&value.count<=max&&value.count===value.data?.length;
 if(!complete(savedResult,MAX_SAVED)||!complete(sourceResult,MAX_SOURCE)||
  !complete(eventResult,MAX_EVENTS)||!complete(controlResult,MAX_SAVED)||
  savedResult.data?.some(p=>p.store_id!==store.id)||
  sourceResult.data?.some(r=>r.store_id!==store.id))
  return <main className="container supplier-shell">
   <h1>Product list temporarily unavailable</h1>
   <p>The supplier's complete private catalog could not be verified. No data was changed.</p>
   <Link href="/supplier">Supplier home</Link>
  </main>;
 const sheet=buildSupplierSheetCards(sourceResult.data,eventResult.data);
 if(!sheet)return <main className="container supplier-shell">
  <h1>Product options need attention</h1>
  <p>Supplier source rows could not be validated. No products were changed.</p>
  <Link href="/supplier">Supplier home</Link>
 </main>;
 const controlMap=new Map((controlResult.data??[]).map(c=>[c.product_id,c]));
 const saved=await Promise.all((savedResult.data??[]).map(async p=>{
  let imageUrl:string|undefined;
  if(p.image_path){
   const {data,error}=await client.storage.from("apex-draft-product-images")
    .createSignedUrl(p.image_path,90);
   if(!error&&data?.signedUrl)imageUrl=data.signedUrl;
  }
  const c=controlMap.get(p.id);
  return {
   id:p.id,name:p.name,sku:p.sku,
   priceCents:Number(p.price_cents),published:p.is_published,
   isActive:p.is_active,hasImage:Boolean(p.image_path),imageUrl,
   requested:c?.supplier_wants_listing===true,
   adminGate:c?.admin_gate??null,
   note:c?.reason??null,
  };
 }));
 return <main className="container supplier-shell apex-simple-products">
  <header className="apex-simple-products-heading">
   <div>
    <Link className="back" href="/supplier">← Supplier dashboard</Link>
    <p className="eyebrow">APEX / {store.display_name}</p>
    <h1>Products</h1>
    <p className="lead">Find a product, edit its details, and manage its options in one place.</p>
   </div>
   <Link className="button primary" href="/supplier/catalog/bulk">Add product</Link>
  </header>
  <SimpleProducts storeId={store.id} saved={saved} sheet={sheet}/>
  <details className="apex-simple-products-more">
   <summary>More product tools</summary>
   <div className="actions">
    <Link href="/supplier/catalog/bulk">Bulk editor &amp; CSV</Link>
    <Link href="/supplier/inventory">Inventory</Link>
    <Link href="/supplier/catalog">Legacy product manager</Link>
    <Link href="/supplier/catalog/media-readiness">Image checks</Link>
    <Link href="/supplier/imports">Older import review</Link>
   </div>
  </details>
  <p className="notice apex-simple-products-footer">
   Supplier edits and content approval are private. Storefront publication requires
   applicable product eligibility checks and respects existing administrator holds.
   Products and stock have not been modified by this page.
  </p>
 </main>;
}
