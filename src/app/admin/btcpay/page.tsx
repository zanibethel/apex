import "server-only";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {parseAdminCategoryStores} from "@/lib/catalog/admin-category-publication.mjs";
import {inspectSharedBtcpayReadinessV1} from "@/lib/btcpay/shared-store-readiness-v1.mjs";

export const dynamic="force-dynamic";
export const metadata={
 title:"BTCPay Connection | Apex Admin",
 robots:{index:false,follow:false},
};

const statusText:Record<string,string>={
 no_bindings:"Hosting and provider-store binding not configured",
 single_apex_store_required:"Exactly one authorized Apex storefront is required",
 single_provider_binding_required:"Exactly one valid BTCPay provider-store mapping is required",
 wrong_store_or_read_key:"Store mapping or read-only key assignment needs correction",
 credential_reuse_rejected:"Read and invoice-writing credentials must be separate",
 no_store_binding:"No BTCPay store is mapped to this Apex storefront",
 missing_key:"Read-only API key has not been configured",
 invalid_key:"Read-only API key format needs correction",
 unreachable:"The provider could not be reached securely",
 key_denied:"Read-only API key denied by the provider",
 store_not_found:"The mapped store was not found",
 provider_error:"The provider returned an error",
 invalid_response:"The provider response could not be verified",
 store_mismatch:"The returned provider store identity does not match",
 currency_mismatch:"The provider store default currency is not USD",
 store_verified:"Expected BTCPay store read over HTTPS — read-only check passed",
 invalid_store:"Apex storefront identity invalid",
};
const recipientText:Record<string,string>={
 unavailable:"Recipient directory unavailable",
 three_recipients_required:"Exactly three distinct role entries are needed",
 inactive_recipients:"Apex, Lily and Tierra entries exist but are not all active",
 directory_only_wallets_unverified:"Directory entries are active; wallet ownership remains unverified",
};
const writerText:Record<string,string>={
 not_configured:"Not configured (expected for preparation)",
 invalid:"Credential configuration invalid",
 same_key_rejected:"Read-only key reuse blocked",
 configured_not_authorized:"Separate key is present, but write permission has NOT been verified",
};
export default async function AdminBtcpayConnection(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");
 const [storesResult,recipientResult]=await Promise.all([
  client.rpc("get_admin_private_category_stores"),
  client.from("payout_recipients")
   .select("id,display_name,recipient_type,status")
   .order("display_name").limit(20),
 ]);
 const stores=storesResult.error?null:parseAdminCategoryStores(storesResult.data);
 const readiness=await inspectSharedBtcpayReadinessV1({
  apexStoreIds:stores?.map(store=>store.id),
  rawBindings:process.env.APEX_BTCPAY_BINDINGS_JSON,
  env:process.env,
  recipients:recipientResult.error?undefined:recipientResult.data??[],
 });
 const verified=readiness.storeStatus==="store_verified";
 return <main className="container supplier-shell apex-branded-dashboard">
  <Link className="back" href="/admin">← Admin dashboard</Link>
  <p className="eyebrow">APEX / ADMIN / BITCOIN CONNECTIVITY</p>
  <h1>BTCPay connection</h1>
  <p className="lead">One BTCPay provider store for Apex, Lily and Tierra.
   This diagnostic only reads one configured provider store; it cannot issue
   invoices, send transfers or activate Prism payout rules.</p>
  <p className="notice"><strong>Checkout remains disabled. Payouts remain disabled.</strong>
   Even a successful provider read does not authorize payment, prove wallet
   ownership, authenticate webhooks or confirm legal product eligibility.</p>
  {stores===null&&<p role="alert" className="notice">
   Private storefront verification is unavailable. No provider calls were made.
  </p>}
  {recipientResult.error&&<p role="alert" className="notice">
   Payout recipient directory could not be read.</p>}
  <section className="supplier-panel" style={{maxWidth:"none",marginTop:24}}>
   <h2>Shared provider store</h2>
   <p className="notice"><strong>Connection:</strong> {statusText[readiness.storeStatus]??"Not verified"}</p>
   {verified&&readiness.providerName&&<p className="notice">
    <strong>Verified provider name:</strong> {readiness.providerName} (USD)</p>}
   <p className="notice"><strong>Apex store records:</strong> {stores?.length??"Unavailable"}</p>
   <p className="notice"><strong>Recipient records:</strong> {recipientText[readiness.recipientStatus]??"Not verified"}</p>
   <p className="notice"><strong>Invoice writer:</strong> {writerText[readiness.writerStatus]??"Not authorized"}</p>
   <p className="notice"><strong>Read-key scope:</strong> Independent least-privilege review required,
    including store-scoped <code>btcpay.store.canviewstoresettings</code>.</p>
   <p className="notice"><strong>Recipient wallets:</strong> 0 of 3 independently verified in this workflow.</p>
   <p className="notice"><strong>Prism rule synchronization:</strong> Not implemented or authorized.
    Saving a new draft does not update the installed Prism plugin.</p>
   <p className="notice"><strong>Pending invoice freeze/drain:</strong> Not implemented.
    Fee, minimum payout, refund and reversal policy await review.</p>
  </section>
  <section className="supplier-panel" style={{maxWidth:"none",marginTop:24}}>
   <h2>Connection setup</h2>
   <p className="notice">First obtain approval for a BTCPay host, then create a single
    <strong> Apex Anabolics</strong> provider store using USD as its default currency.
    Configure one server-only <code>APEX_BTCPAY_BINDINGS_JSON</code> entry for the
    Apex storefront using <code>APEX_BTCPAY_KEY_READ_ONLY</code>.
    Do not create a separate BTCPay store for Lily or Tierra.</p>
   <p className="notice">The read key must have only the required provider
    store-scoped permissions. Keep any later
    <code> APEX_BTCPAY_KEY_INVOICE_WRITER</code> key distinct, server-only and
    unused until separate authorization. Do not add wallet seeds or payout
    signing secrets to Vercel.</p>
   <p className="notice">This page cannot synchronize Prism, confirm payouts
    or independently verify authorization. See the infrastructure and operator
    checklist in the Track 2 project documentation.</p>
   <div className="actions">
    <Link className="button secondary" href="/admin/checkout-integration">Checkout integration status</Link>
    <Link className="button secondary" href="/admin/btcpay">Refresh read-only status</Link>
    <Link className="button secondary" href="/admin/recipients">Recipient directory</Link>
    <Link className="button secondary" href="/admin/splits/configure">10% / 45% / 45% draft split</Link>
    <Link className="button secondary" href="/admin/payment-monitor">Payment monitor</Link>
   </div>
  </section>
 </main>;
}
