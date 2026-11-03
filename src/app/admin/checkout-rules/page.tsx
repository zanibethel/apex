import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {parseCheckoutRulesOverview} from "@/lib/commerce/checkout-rule-overview.mjs";
import {TaxCollectionBulkPanel} from "@/app/supplier/checkout-rules/tax-bulk-panel";
import {ShippingSettingsForm} from "@/app/supplier/checkout-rules/shipping-form";

export const dynamic="force-dynamic";
export const metadata={title:"Tax and Shipping Rules | Apex Admin",
 robots:{index:false,follow:false}};
const STORE_ID="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";

export default async function AdminCheckoutRules(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(auth.user))
  redirect("/admin/sign-in");
 const result=await client.rpc("get_admin_private_checkout_rules_overview",{
  p_store_id:STORE_ID,
 });
 const rules=result.error?null:parseCheckoutRulesOverview(result.data,STORE_ID);
 return <main className="container supplier-shell apex-branded-dashboard"
  style={{minWidth:0}}>
  <Link className="back" href="/admin">← Admin dashboard</Link>
  <p className="eyebrow">APEX / ADMIN / CHECKOUT CONFIGURATION</p>
  <h1>Tax &amp; shipping rules</h1>
  <p className="lead">Manage which product lines are marked for sales-tax
   collection, optional shipping fees and automatic free-shipping thresholds.</p>
  <p className="notice"><strong>Customer checkout is still disabled.</strong>
   Tax classification requires verified jurisdiction-specific rules;
   this page cannot authorize a tax exemption, publish products,
   reserve stock, or create an invoice.</p>
  {!rules?<p role="alert" className="notice">
   Private rule configuration is unavailable. No settings were changed.
  </p>:<>
   <p className="notice">Store: {rules.storeName} · {rules.products.length} products</p>
   <TaxCollectionBulkPanel storeId={rules.storeId} products={rules.products}/>
   <ShippingSettingsForm storeId={rules.storeId} initial={rules.shipping}/>
  </>}
  <div className="actions">
   <Link className="button secondary" href="/supplier/discounts">
    Manage discount and free-shipping codes</Link>
   <Link className="button secondary" href="/admin/checkout-review">
    Checkout layout review</Link>
  </div>
 </main>;
}
