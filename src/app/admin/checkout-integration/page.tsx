import "server-only";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {parseAdminCategoryStores} from "@/lib/catalog/admin-category-publication.mjs";
import {parseAdminCheckoutJournalSummary} from "@/lib/checkout/admin-private-order-journal.mjs";
import {inspectSharedBtcpayReadinessV1} from "@/lib/btcpay/shared-store-readiness-v1.mjs";
import {buildCheckoutConnectionReportV1} from "@/lib/checkout/checkout-connection-readiness-v1.mjs";

export const dynamic="force-dynamic";
export const metadata={title:"Checkout Integration | Apex Admin",
 robots:{index:false,follow:false}};
export default async function CheckoutIntegrationPage(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");
 const [storesResult,recipientsResult,journalResult,retailResult]=await Promise.all([
  client.rpc("get_admin_private_category_stores"),
  client.from("payout_recipients").select("id,recipient_type,status").limit(20),
  client.rpc("get_admin_checkout_journal_overview"),
  client.rpc("get_retail_showcase_gate"),
 ]);
 const stores=storesResult.error?null:parseAdminCategoryStores(storesResult.data);
 const btcpay=await inspectSharedBtcpayReadinessV1({
  apexStoreIds:stores?.map(s=>s.id),
  rawBindings:process.env.APEX_BTCPAY_BINDINGS_JSON,
  env:process.env,
  recipients:recipientsResult.error?undefined:recipientsResult.data??[],
 });
 const journal=journalResult.error?null:
  parseAdminCheckoutJournalSummary(journalResult.data);
 const report=buildCheckoutConnectionReportV1({
  retailShowcase:retailResult.error?null:retailResult.data,
  quoteFlag:process.env.APEX_PUBLIC_SOLD_OUT_CATALOG==="enabled",
  journal,btcpay,
 });
 const label=(state:string)=>report.legend[state as keyof typeof report.legend]??"Unknown";
 return <main className="container supplier-shell apex-branded-dashboard"
  style={{minWidth:0,overflowWrap:"anywhere"}}>
  <Link className="back" href="/admin">← Admin dashboard</Link>
  <p className="eyebrow">APEX / CHECKOUT / READ-ONLY CONNECTIONS</p>
  <h1>Checkout integration</h1>
  <p className="lead">A single view of the existing cart, order journal, BTCPay and
   payout connections. It reports configuration and integration progress only.</p>
  <p className="notice"><strong>No new product rules or restrictions were introduced.</strong>
   This page cannot change product eligibility, enable payments, create orders,
   reserve stock or issue invoices.</p>
  <section className="supplier-panel" aria-labelledby="apex-integration-next">
   <h2 id="apex-integration-next">Smallest next connection</h2>
   <p>{report.nextAction}</p>
   <div className="actions">
    <Link className="button secondary" href="/admin/btcpay">BTCPay setup</Link>
    <Link className="button secondary" href="/admin/checkout-readiness">Order readiness</Link>
   </div>
  </section>
  <section className="supplier-panel" style={{marginTop:20}}
   aria-labelledby="apex-integration-stages">
   <h2 id="apex-integration-stages">Connected systems and unfinished handoffs</h2>
   <ul className="supplier-stores">{report.steps.map(s=>
    <li key={s.id} style={{alignItems:"start",gap:12}}>
     <span style={{minWidth:0}}>
      <strong>{s.label}</strong>
      <small style={{display:"block",marginTop:4}}>{s.detail}</small>
      <Link href={s.href}>Inspect existing controls</Link>
     </span>
     <strong>{label(s.state)}</strong>
    </li>)}</ul>
  </section>
  <section className="supplier-panel" style={{marginTop:20}}
   aria-labelledby="apex-integration-evidence">
   <h2 id="apex-integration-evidence">Order evidence</h2>
   <p className="notice">Held-only audit counts are not confirmed purchases.</p>
   <p><strong>Private held order intents:</strong> {report.heldOrderRecords??"Unavailable"}</p>
   <p><strong>Provider POST intents:</strong> {report.heldProviderIntents??"Unavailable"}</p>
   <p><strong>Customer orders, invoices and payments:</strong> Not enabled through
    this integration.</p>
   <div className="actions">
    <Link className="button secondary" href="/admin/order-admission">Order preflight</Link>
    <Link className="button secondary" href="/admin/payment-monitor">Payment monitor</Link>
    <Link className="button secondary" href="/admin/splits/configure">Payout split settings</Link>
   </div>
  </section>
  <p className="notice">No payment credentials, wallet addresses, customer delivery
   details or HMAC values are displayed or stored by this diagnostic.</p>
 </main>;
}
