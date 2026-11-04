import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {ShippingSettingsForm,NO_SHIPPING} from "@/app/supplier/checkout-rules/shipping-form";

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
 const {data,error}=await w.client.from("apex_store_shipping_settings")
  .select("charge_shipping,flat_shipping_cents,medium_flat_shipping_cents,free_shipping_min_subtotal_cents")
  .eq("store_id",store.id).maybeSingle();
 const policy=!error?(data??NO_SHIPPING):null;
 return <main className="container supplier-shell">
  <Link className="back" href="/supplier/catalog">← Supplier products</Link>
  <p className="eyebrow">APEX / SUPPLIER / SHIPPING</p>
  <h1>Shipping rules</h1>
  <p className="notice">Set USPS Padded Flat Rate Envelope / Medium Box prices and free shipping over $200.</p>
  {policy?<ShippingSettingsForm storeId={store.id} initial={policy}
    enabled={allowed}/>:
   <p role="alert">Shipping configuration could not be loaded safely.</p>}
  <div className="actions">
   <Link className="button secondary" href="/supplier/discounts">
    Discount codes and free shipping</Link>
   <Link className="button secondary" href="/supplier/catalog/bulk">
    Manage products</Link>
  </div>
 </main>;
}
