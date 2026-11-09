import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {SupplierShowroom,type ShowroomProduct} from "./supplier-showroom";

export const dynamic="force-dynamic";
export const metadata={title:"Private Storefront Layout Test | Apex Supplier",robots:{index:false,follow:false}};

export default async function SupplierStorefrontTest(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/supplier/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!auth.user||auth.user.is_anonymous||!auth.user.email_confirmed_at)
  redirect("/supplier/sign-in");
 const {data:memberships,error:memberError}=await client.from("supplier_memberships")
  .select("supplier_id,role").in("role",["owner","manager"]).limit(20);
 if(memberError||!memberships?.length)return <main className="container supplier-shell">
  <h1>Supplier owner or manager access required.</h1>
  <Link href="/supplier">Back to supplier dashboard</Link>
 </main>;
 const {data:stores,error:storeError}=await client.from("stores")
  .select("id,supplier_id,is_public")
  .in("supplier_id",memberships.map(m=>m.supplier_id))
  .eq("is_public",false).limit(20);
 if(storeError||stores?.length!==1)return <main className="container supplier-shell">
  <h1>Choose your assigned private storefront.</h1>
  <p>A single private supplier store is required for this test. No product status has changed.</p>
  <Link href="/supplier">Back to supplier dashboard</Link>
 </main>;
 const store=stores[0];
 const [
  {data:products,error:productError,count:productCount},
  {data:categories,error:categoryError,count:categoryCount},
  {data:inventory,error:inventoryError,count:inventoryCount},
  {data:preferences,error:preferenceError,count:preferenceCount},
 ]=await Promise.all([
  client.from("products")
   .select("id,sku,name,description,price_cents,compare_at_price_cents,category_id,image_path,currency,is_active",{count:"exact"})
   .eq("store_id",store.id).order("name").limit(100),
  client.from("categories").select("id,name",{count:"exact"})
   .eq("store_id",store.id).limit(100),
  client.from("inventory_items").select("product_id,quantity_on_hand,quantity_reserved",{count:"exact"})
   .eq("store_id",store.id).limit(150),
  client.from("supplier_private_stock_preferences").select("product_id,track_quantities",{count:"exact"})
   .eq("store_id",store.id).limit(150),
 ]);
 if(productError||categoryError||inventoryError||preferenceError||
    productCount===null||categoryCount===null||inventoryCount===null||preferenceCount===null||
    productCount!==products?.length||categoryCount!==categories?.length||
    inventoryCount!==inventory?.length||preferenceCount!==preferences?.length)
  return <main className="container supplier-shell">
   <h1>Private storefront preview unavailable.</h1>
   <p>The complete authorized product and inventory data could not be confirmed. No partial results are shown.</p>
   <Link href="/supplier">Back to supplier dashboard</Link>
  </main>;
 const categoryNames=new Map((categories??[]).map(item=>[item.id,item.name]));
 const stock=new Map((inventory??[]).map(item=>[item.product_id,item]));
 const track=new Map((preferences??[]).map(item=>[item.product_id,item.track_quantities]));
 // Create only short-lived signed URLs for this authenticated supplier's
 // own saved product images. Never expose paths or credentials.
 const images=new Map<string,string>();
 await Promise.all((products??[]).filter(p=>Boolean(p.image_path))
  .map(async p=>{
   const {data,error}=await client.storage.from("apex-draft-product-images")
    .createSignedUrl(p.image_path!,300);
   if(!error&&data?.signedUrl)images.set(p.id,data.signedUrl);
  }));
 const rows:ShowroomProduct[]=(products??[]).map(p=>{
  const item=stock.get(p.id);
  const tracked=track.get(p.id)!==false;
  const actualAvailable=item?Math.max(0,item.quantity_on_hand-item.quantity_reserved):0;
  return {
   id:p.id,name:p.name,sku:p.sku,description:p.description,
   category:categoryNames.get(p.category_id??"")??"Uncategorized",
   priceCents:Number(p.price_cents),
   compareAtCents:p.compare_at_price_cents==null?null:Number(p.compare_at_price_cents),
   currency:p.currency,active:p.is_active,
   initialInStock:p.is_active&&(tracked?actualAvailable>0:true),
   trackingEnabled:tracked,
   imageUrl:images.get(p.id),
  };
 });
 return <main className="container supplier-shell">
  <Link href="/supplier" className="back">← Supplier dashboard</Link>
  <SupplierShowroom products={rows}/>
 </main>;
}
