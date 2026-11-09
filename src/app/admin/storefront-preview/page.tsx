import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {LiveCatalogTester,type PrivateTestProduct} from "./live-catalog-tester";

export const dynamic="force-dynamic";
export const metadata={title:"Storefront Presentation | Apex",robots:{index:false,follow:false}};
const LIMIT=100;
export default async function StorefrontPreview(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");

 // Normal signed-in admin RLS only: no service key, public product bypass,
 // wallet data or checkout endpoints.
 const [{data:products,error:productError,count:productCount},
        {data:categories,error:categoryError},
        {data:inventory,error:inventoryError}]=await Promise.all([
  client.from("products")
   .select("id,store_id,category_id,sku,name,description,price_cents,compare_at_price_cents,image_path,currency,is_active,is_published",{count:"exact"})
   .is("archived_at",null).order("name").limit(LIMIT),
  client.from("categories").select("id,store_id,name").limit(LIMIT),
  client.from("inventory_items")
   .select("product_id,store_id,quantity_on_hand,quantity_reserved")
   .limit(LIMIT),
 ]);
 const error=productError||productCount===null||productCount!==products?.length;
 const partialReadback=Boolean(categoryError||inventoryError);
 const imageUrls=new Map<string,string>();
 if(!error&&products?.length){
  await Promise.all(products.filter(p=>Boolean(p.image_path))
   .map(async product=>{
    const {data:preview,error:imageError}=await client.storage
     .from("apex-draft-product-images")
     .createSignedUrl(product.image_path!,90);
    if(!imageError&&preview?.signedUrl)
     imageUrls.set(product.id,preview.signedUrl);
   }));
 }
 const names=new Map((categories??[]).map(item=>[item.id,item.name]));
 const stock=new Map((inventory??[]).map(item=>[item.product_id,item]));
 const previewProducts:PrivateTestProduct[]=(products??[]).map(product=>{
  const inv=stock.get(product.id);
  return {
   id:product.id,name:product.name,sku:product.sku,
   description:product.description,category:names.get(product.category_id??"")??"Product",
   priceCents:Number(product.price_cents),compareAtCents:product.compare_at_price_cents==null
    ?null:Number(product.compare_at_price_cents),
   currency:product.currency,active:product.is_active,published:product.is_published,
   availableStock:inv?Math.max(0,inv.quantity_on_hand-inv.quantity_reserved):null,
   imageUrl:imageUrls.get(product.id),
  };
 });
 return <main className="container supplier-shell apex-branded-dashboard"
   style={{minWidth:0,overflowWrap:"anywhere"}}>
  <Link href="/admin" className="back">← Admin dashboard</Link>
  <p className="eyebrow">APEX / ADMIN / STOREFRONT PRESENTATION</p>
  <h1>Storefront review</h1>
  <p className="lead">Test saved product records in a customer-style layout, including searching, prices, images and code-only product questions.</p>
  <p className="notice"><strong>Private admin view.</strong> These product records
   are not automatically public. Changes to availability or visibility require
   their existing supplier and release controls. Checkout remains unavailable.</p>
  {partialReadback&&!error&&<p className="notice" role="status">Some category or inventory details could not be confirmed; their details may be missing in the preview.</p>}
  {error?<p className="notice" role="status">The complete private product list could not be verified. No partial list will be shown.</p>:
   !products?.length?<p className="notice">No product records in the current
    authorized view.</p>:
   <>
    <p className="notice">Loaded all {products.length} authorized saved products for this private live-site test. No products were published.</p>
    <LiveCatalogTester products={previewProducts}/>
   </>}
  <div className="actions">
   <Link className="button primary" href="/supplier/catalog/bulk">Manage products</Link>
   <Link className="button secondary" href="/admin/listing-controls">Listing controls</Link>
   <Link className="button secondary" href="/admin/checkout-review">Review real-catalog checkout</Link>
   <Link className="button secondary" href="/catalog">View public catalog</Link>
  </div>
 </main>;
}
