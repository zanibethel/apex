import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {ShippingSettingsForm} from "@/app/supplier/checkout-rules/shipping-form";

export const dynamic="force-dynamic";
export const metadata={title:"Shipping Rules | Apex Admin",
 robots:{index:false,follow:false}};
const STORE_ID="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const FREE={charge_shipping:false,flat_shipping_cents:0,
 free_shipping_min_subtotal_cents:null};

export default async function AdminCheckoutRules(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");
 const result=await client.from("apex_store_shipping_settings")
  .select("charge_shipping,flat_shipping_cents,free_shipping_min_subtotal_cents")
  .eq("store_id",STORE_ID).maybeSingle();
 const policy=result.error?null:(result.data??FREE);
 return <main className="container supplier-shell apex-branded-dashboard"
  style={{minWidth:0}}>
  <Link className="back" href="/admin">← Admin dashboard</Link>
  <p className="eyebrow">APEX / ADMIN / SHIPPING</p>
  <h1>Shipping &amp; free shipping</h1>
  <p className="lead">Control the optional flat shipping fee and set the
   discounted merchandise threshold for free shipping. Suppliers can
   configure the same rules for their assigned store.</p>
  <p className="notice"><strong>Customer checkout remains disabled.</strong>
   Saving shipping rules does not release products or create orders or invoices.</p>
  {policy?<ShippingSettingsForm storeId={STORE_ID} initial={policy}/>:
   <p role="alert" className="notice">Private shipping settings
    could not be loaded. No changes were made.</p>}
  <div className="actions">
   <Link className="button secondary" href="/admin/shipping-promotions">
    Manage discount and free-shipping codes</Link>
   <Link className="button secondary" href="/admin/checkout-review">
    Review shipping in checkout</Link>
  </div>
 </main>;
}
