import "server-only";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {parseAdminCategoryStores} from "@/lib/catalog/admin-category-publication.mjs";
import {probePrivateGreenfieldStore} from "@/lib/btcpay/private-greenfield-status.mjs";

export const dynamic="force-dynamic";
export const metadata={
 title:"BTCPay Connection | Apex Admin",
 robots:{index:false,follow:false},
};
const labels:Record<string,{name:string;detail:string}>={
 no_bindings:{name:"Not configured",detail:"No provider store bindings are configured for Apex yet."},
 invalid_bindings:{name:"Configuration needs correction",detail:"A provider URL, store mapping or credential reference is invalid or duplicated."},
 no_store_binding:{name:"Store not connected",detail:"No BTCPay store is bound to this Apex private supplier store."},
 missing_key:{name:"API key missing",detail:"The private credential for this supplier store is not configured on the server."},
 invalid_key:{name:"Credential format invalid",detail:"Replace the server-side key with a valid scoped Greenfield credential."},
 unreachable:{name:"Provider unreachable",detail:"The BTCPay server could not be reached securely. No retry or payment action was attempted."},
 key_denied:{name:"Permission denied",detail:"The configured Greenfield key cannot read this BTCPay store. Check its store-scoped read permission."},
 store_not_found:{name:"Store not found",detail:"The configured store ID does not exist or cannot be viewed using this key."},
 provider_error:{name:"Provider unavailable",detail:"BTCPay returned a non-successful response to the read-only check."},
 invalid_response:{name:"Unexpected provider response",detail:"BTCPay did not return a usable store record."},
 store_mismatch:{name:"Store identity mismatch",detail:"BTCPay returned a store different from the expected provider store. The connection is not trusted."},
 currency_mismatch:{name:"Currency mismatch",detail:"The BTCPay store's default currency is not USD, which Apex uses for its saved catalog."},
 store_verified:{name:"Store read verified",detail:"The configured key read the expected BTCPay store over HTTPS. Wallet, webhook, invoice writer and release approval are not yet verified."},
 invalid_store:{name:"Store unavailable",detail:"Apex supplied an invalid private store identity."},
};

export default async function AdminBtcpayConnection(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");

 // Existing privileged, verified-admin readback. No global service key.
 const result=await client.rpc("get_admin_private_category_stores");
 const stores=result.error?null:parseAdminCategoryStores(result.data);
 const records=stores===null?null:await Promise.all(stores.slice(0,20).map(async store=>({
  ...store,probe:await probePrivateGreenfieldStore({
   apexStoreId:store.id,
   rawBindings:process.env.APEX_BTCPAY_BINDINGS_JSON,
   env:process.env,
  }),
 })));
 return <main className="container supplier-shell apex-branded-dashboard">
  <Link className="back" href="/admin">← Admin dashboard</Link>
  <p className="eyebrow">APEX / ADMIN / BITCOIN CONNECTIVITY</p>
  <h1>BTCPay connection</h1>
  <p className="lead">Check store-specific Greenfield API connectivity using
   private server credentials. This screen never issues invoices or requests payment.</p>
  <p className="notice"><strong>Checkout remains disabled.</strong> A successful
   store-read check does not verify wallet setup, payment webhooks, automatic
   supplier splits, order storage, or independent product release approval.</p>
  {records===null?<p role="alert" className="notice">Private storefront readback failed.
   No provider connection requests were made.</p>:
   records.length===0?<p className="notice">No private supplier stores are available.</p>:
   <div className="apex-product-grid">
    {records.map(({id,name,probe})=>{
     const info=labels[probe.status]??{name:"Connection not verified",detail:"The check could not confirm a trusted store connection."};
     return <article key={id} className="apex-product-card">
      <p className="eyebrow">PRIVATE SUPPLIER STORE</p>
      <h2>{name}</h2>
      <p className="notice"><strong>Connection:</strong> {info.name}</p>
      <p className="notice">{info.detail}</p>
      {probe.status==="store_verified"&&<p className="notice">
       <strong>Verified provider store:</strong> {probe.providerName}</p>}
      <p className="notice">Apex store ID: <code>{id}</code></p>
     </article>;
    })}
   </div>}
  <section className="supplier-panel" style={{maxWidth:"none",marginTop:24}}>
   <h2>Connection setup</h2>
   <p className="notice">Configure the server-only <code>APEX_BTCPAY_BINDINGS_JSON</code>
    mapping for each private Apex store, then set a different
    <code> APEX_BTCPAY_KEY_*</code> secret for each mapped provider store.
    The probe key needs only BTCPay's store-scoped
    <code> btcpay.store.canviewstoresettings</code> permission.</p>
   <p className="notice">Add secrets through Vercel project environment settings,
    not inside Apex forms, GitHub code, or chat. Store-specific invoice-writer
    credentials must remain separate from the read-only connection key.</p>
   <p className="notice">No BTCPay credentials are sent to the browser.
    Use Refresh to repeat the read-only verification.</p>
   <div className="actions">
    <Link className="button secondary" href="/admin/btcpay">Refresh connection</Link>
    <Link className="button secondary" href="/admin/checkout-review">Checkout layout review</Link>
    <Link className="button secondary" href="/admin/payment-monitor">Payment monitor</Link>
   </div>
  </section>
 </main>;
}
