import "server-only";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {probeTaxCloudForAdmin} from "@/lib/tax/taxcloud-v3-server";

export const dynamic="force-dynamic";
export const metadata={
 title:"Tax provider connectivity | Apex Admin",
 robots:{index:false,follow:false},
};
const STORE_ID="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const statusLabels:Record<string,string>={
 unconfigured:"Not configured",invalid_bindings:"Configuration invalid",
 no_store_binding:"No store connection",invalid_origin:"Origin address required",
 missing_classifications:"Product classifications missing",
 invalid_classifications:"Product classifications need correction",
 missing_key:"API key missing",unreachable:"Provider unreachable",
 key_denied:"Provider access denied",provider_error:"Provider error",
 invalid_response:"Unexpected provider response",connected:"Connection verified",
 ready:"Configured, not yet verified",
};
export default async function AdminTaxProvider(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(data.user))redirect("/admin/sign-in");
 const result=await probeTaxCloudForAdmin(STORE_ID);
 return <main className="container supplier-shell apex-branded-dashboard">
  <Link className="back" href="/admin">← Admin dashboard</Link>
  <p className="eyebrow">APEX / ADMIN / TAX API CONNECTIVITY</p>
  <h1>Sales tax provider</h1>
  <p className="lead">TaxCloud v3 — private merchant API verification.
   This page checks connectivity without calculating customer tax,
   creating TaxCloud orders, or activating Apex checkout.</p>
  <section className="supplier-panel" style={{maxWidth:"none"}}>
   <h2>Provider connection</h2>
   <p><strong>Status: </strong>{statusLabels[result.status]??"Not verified"}</p>
   <p className="notice">{result.detail??"TaxCloud has not been configured."}</p>
   <p className="notice">Shipping origin configured: {result.originConfigured?"Yes":"No"}.
    {" "}Reviewed product tax codes: {result.classifiedProducts}.</p>
   <p className="notice">Private estimate switch: {
    process.env.APEX_TAXCLOUD_PRIVATE_ESTIMATES_ENABLED==="true"?
     "Enabled for verified Admin requests":"Off"}</p>
   <p className="notice"><strong>Orders and Bitcoin payments remain disabled.</strong>
    A successful provider Ping only verifies a read-only connection and
    does not certify product exemptions, nexus, payment approval or final taxes.</p>
  </section>
  <section className="supplier-panel" style={{maxWidth:"none"}}>
   <h2>Connection setup</h2>
   <p className="notice">Configure a TaxCloud merchant account with the correct
    seller legal identity, nexus states and actual shipping origin.
    Generate a TaxCloud v3 API key and custom integration Connection ID.</p>
   <p className="notice">Store the per-store mapping in Vercel as a server-only
    encrypted environment variable <code>APEX_TAXCLOUD_BINDINGS_JSON</code>.
    Include the Apex store ID, TaxCloud Connection ID, key environment-variable
    name, actual shipping origin, and individually reviewed product taxability
    codes (TICs). Keep the key itself in a separate encrypted
    <code> APEX_TAXCLOUD_KEY_*</code> variable, one credential per store.</p>
   <p className="notice">After credentials, address, nexus and product tax
    classifications are reviewed, the server-only
    <code> APEX_TAXCLOUD_PRIVATE_ESTIMATES_ENABLED</code> switch can allow
    authenticated Admin-only cart estimates. It stays off by default.</p>
   <p className="notice">A product with Collect sales tax unchecked also
    requires a reviewed tax-free classification reference. Apex will not turn
    an unchecked box into a zero-tax certificate.</p>
   <div className="actions">
    <Link className="button secondary" href="/admin/tax">Refresh connection</Link>
    <Link className="button secondary" href="/admin/checkout-review">
     Private checkout review</Link>
    <Link className="button secondary" href="/admin/checkout-rules">
     Tax &amp; shipping settings</Link>
   </div>
  </section>
 </main>;
}
