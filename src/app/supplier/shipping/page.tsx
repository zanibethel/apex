import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {ShippingSettingsForm,NO_SHIPPING} from "@/app/supplier/checkout-rules/shipping-form";
import {ProductShippingProfileForm} from "./product-profile-form";

export const dynamic="force-dynamic";
export const metadata={title:"Private Shipping Rules | Apex Supplier",
 robots:{index:false,follow:false}};

export default async function SupplierShippingRules(){
 const w=await getSupplierWorkspace();
 if(!w)redirect("/supplier/sign-in");
 const privateStores=w.stores.filter(store=>!store.is_public);
 if(privateStores.length!==1)return <main className="container supplier-shell">
  <h1>Choose a single private storefront.</h1>
  <Link href="/supplier">Back to supplier dashboard</Link>
 </main>;
 const store=privateStores[0];
 const allowed=w.memberships.some(m=>
   m.supplier_id===store.supplier_id&&
   (m.role==="owner"||m.role==="manager"));
 const [shipping,products,profiles]=await Promise.all([
  w.client.from("apex_store_shipping_settings")
   .select("charge_shipping,flat_shipping_cents,medium_flat_shipping_cents,free_shipping_min_subtotal_cents,envelope_max_items")
   .eq("store_id",store.id).maybeSingle(),
  w.client.from("products")
   .select("id,name,sku").eq("store_id",store.id)
   .eq("is_published",false).is("archived_at",null)
   .order("name").limit(250),
  w.client.from("supplier_product_shipping_profiles")
   .select("product_id,length_mm,width_mm,height_mm,weight_g,flexible,updated_at",{count:"exact"})
   .eq("store_id",store.id).limit(250),
 ]);
 const policy=!shipping.error?(shipping.data??NO_SHIPPING):null;
 const profilesLoaded=!profiles.error&&profiles.count!==null&&
  profiles.count===profiles.data?.length&&profiles.count<=250;
 const productsLoaded=!products.error&&Array.isArray(products.data)&&
  products.data.length<=250;
 const profileByProduct=new Map((profilesLoaded?profiles.data:[])?.map(p=>[p.product_id,p])??[]);
 return <main className="container supplier-shell">
  <Link className="back" href="/supplier/catalog">← Supplier products</Link>
  <p className="eyebrow">APEX / SUPPLIER / SHIPPING</p>
  <h1>Shipping rules</h1>
  <p className="notice">Set USPS rates, optional free-shipping offers, and packed product dimensions. When all items in a cart have measurements, Apex estimates the package count and charges per package. Unmeasured products use a provisional item-count estimate until configured.</p>
  {policy?<ShippingSettingsForm storeId={store.id} initial={policy}
    enabled={allowed}/>:
   <p role="alert">Shipping configuration could not be loaded safely.</p>}
  <section aria-label="Product packed measurements" className="apex-product-shipping-section">
   <h2>Packed dimensions and weight</h2>
   <p className="notice">Enter the measurements of one fully packed unit. They determine whether an item fits a padded envelope or medium USPS box, and whether a cart needs multiple packages. No measurements have been guessed for existing products.</p>
   {!profilesLoaded||!productsLoaded?
    <p role="alert" className="notice">Shipping profile records are unavailable or incomplete. Measurements cannot be changed safely.</p>:
    products.data.length===0?<p className="notice">Create a saved product before assigning shipping measurements.</p>:
    <div className="apex-product-shipping-list">
     {products.data.map(product=>
      <ProductShippingProfileForm key={product.id}
       storeId={store.id} productId={product.id} name={product.name} sku={product.sku}
       initial={profileByProduct.get(product.id)??null}
       enabled={allowed&&process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true"}/>)}
    </div>}
  </section>
  <style>{`.apex-product-shipping-section{margin:26px 0}.apex-product-shipping-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:16px;margin-top:15px}.apex-product-shipping-card{min-width:0}.apex-product-shipping-card h3{margin-top:0}.apex-shipping-dimension-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.apex-shipping-dimension-grid label{display:grid;gap:5px;min-width:0}.apex-shipping-dimension-grid input{min-width:0;width:100%;box-sizing:border-box}.apex-shipping-clear-form{margin-top:12px}`}</style>
  <div className="actions">
   <Link className="button secondary" href="/supplier/discounts">
    Discount codes and free shipping</Link>
   <Link className="button secondary" href="/supplier/usps">Supplier-paid USPS account</Link>
   <Link className="button secondary" href="/supplier/catalog/bulk">
    Manage products</Link>
  </div>
 </main>;
}
