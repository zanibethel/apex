import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {CheckoutCatalogReview} from "./checkout-catalog-review";
import "../../checkout/preview/checkout-preview.css";
import "./checkout-review.css";

export const dynamic="force-dynamic";
export const metadata={
 title:"Checkout Review | Apex Admin",
 description:"Private, production-style catalog and checkout layout review.",
 robots:{index:false,follow:false},
};
const STORE_ID="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";

export default async function AdminCheckoutReview(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");

 // Use signed-in admin RLS and short-lived image URLs, not service_role or
 // an unaudited public catalog endpoint. This route cannot create an order.
 const [{data:products,error:productError},
        {data:categories,error:categoryError},
        {data:inventory,error:inventoryError}]=await Promise.all([
  client.from("products")
   .select("id,store_id,name,sku,description,price_cents,compare_at_price_cents,category_id,image_path,currency,is_active")
   .eq("store_id",STORE_ID).eq("is_published",false).order("name").limit(100),
  client.from("categories").select("id,name")
   .eq("store_id",STORE_ID).limit(100),
  client.from("inventory_items")
   .select("product_id,quantity_on_hand,quantity_reserved")
   .eq("store_id",STORE_ID).limit(100),
 ]);
 const unavailable=Boolean(productError||categoryError||inventoryError);
 const names=new Map((categories??[]).map(c=>[c.id,c.name]));
 const quantities=new Map((inventory??[]).map(i=>[i.product_id,i]));
 const images=new Map<string,string>();
 if(!unavailable)await Promise.all((products??[]).filter(p=>p.image_path).map(async p=>{
  const {data,error}=await client.storage.from("apex-draft-product-images")
   .createSignedUrl(p.image_path!,120);
  if(!error&&data?.signedUrl)images.set(p.id,data.signedUrl);
 }));
 const rows=unavailable?[]:(products??[]).filter(p=>
   Number.isSafeInteger(Number(p.price_cents))&&Number(p.price_cents)>0&&
   p.currency==="USD"
 ).map(p=>{
  const inv=quantities.get(p.id);
  return {
   id:p.id,name:p.name,sku:p.sku,description:p.description??"",
   category:names.get(p.category_id??"")??"Uncategorized",
   priceCents:Number(p.price_cents),
   compareAtCents:p.compare_at_price_cents==null?null:Number(p.compare_at_price_cents),
   imageUrl:images.get(p.id)??null,
   available:inv?Math.max(0,inv.quantity_on_hand-inv.quantity_reserved):null,
   active:p.is_active===true,
  };
 });
 return <main className="container apex-checkout-preview apex-checkout-catalog-review">
  <div className="apex-checkout-topline">
   <Link href="/admin/storefront-preview" className="apex-checkout-back">← Storefront review</Link>
   <span className="apex-checkout-safe">PRIVATE ADMIN REVIEW · PAYMENT DISABLED</span>
  </div>
  <div className="apex-checkout-head">
   <p className="eyebrow">APEX ANABOLICS / CHECKOUT</p>
   <h1>THE FINAL <span>STEP.</span></h1>
   <p>Review the buyer experience using the real saved Apex catalog and prices.
    Payment handoff and ordering stay disabled until release and payment authorization.</p>
  </div>
  {unavailable?<p className="notice" role="alert">Catalog, category or stock readback failed. The checkout review is not available.</p>:
   !rows.length?<p className="notice">No private products are ready for checkout layout review.</p>:
   <CheckoutCatalogReview products={rows}/>}
  <div className="actions">
   <Link className="button secondary" href="/supplier/catalog/bulk">Edit product cards</Link>
   <Link className="button secondary" href="/admin/catalog-release">Review catalog release</Link>
  </div>
 </main>;
}
