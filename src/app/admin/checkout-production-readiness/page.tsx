import "server-only";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {evaluateRetailProductionReadinessV1}
 from "@/lib/checkout/retail-production-readiness-v1.mjs";
export const dynamic="force-dynamic";
export const revalidate=0;
export const runtime="nodejs";
export const metadata={title:"Production Checkout Readiness | Apex Admin",
 robots:{index:false,follow:false}};
export default async function CheckoutProductionReadinessPage(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(data.user))
  redirect("/admin/sign-in");
 const report=evaluateRetailProductionReadinessV1(process.env);
 return <main className="container supplier-shell apex-branded-dashboard"
  style={{minWidth:0,overflowWrap:"anywhere"}}>
  <Link className="back" href="/admin/checkout-integration">← Checkout integration</Link>
  <p className="eyebrow">APEX / ADMIN / NONPAYABLE RELEASE</p>
  <h1>Production checkout readiness</h1>
  <p className="lead">Read-only review of prerequisites for temporary
   customer order submissions. No payment or shipping permission is granted.</p>
  <section className="supplier-panel">
   <h2>Release status</h2>
   <p role="status" className="notice"><strong>
    {report.routeEligible?"Operator flags are set":"Review incomplete"}
   </strong> — {report.missing} of four supplemental reviews need acknowledgment.
    Environment flags are not proof of external configuration. The separate
    PostgreSQL order engine is independently gated and cannot be enabled here.</p>
   <ul className="supplier-stores">
    <li><span>Two original submission switches</span>
     <strong>{report.requested?"Set":"Off"}</strong></li>
    <li><span>Supplemental operator reviews</span>
     <strong>{report.reviewed?"Acknowledged":"Incomplete"}</strong></li>
    <li><span>Bitcoin payments and Prism payouts</span><strong>Not authorized</strong></li>
    <li><span>Supplier shipping and postage</span><strong>Not authorized</strong></li>
   </ul>
  </section>
  <section className="supplier-panel" style={{marginTop:20}}>
   <h2>Required review evidence</h2>
   <ul className="supplier-stores">
    {report.checks.map((c:{id:string;label:string;passed:boolean;help:string})=>
     <li key={c.id} style={{alignItems:"start",gap:12}}>
      <span><strong>{c.label}</strong>
       <small style={{display:"block",marginTop:4}}>{c.help}</small></span>
      <strong>{c.passed?"Acknowledged":"Needs review"}</strong>
     </li>)}
   </ul>
   <p className="notice">This status is based on server-only operator
    acknowledgments. It does not read Vercel WAF rules, Supabase Auth provider
    settings, cron histories or customer delivery records.</p>
   <div className="actions">
    <Link className="button secondary" href="/admin/checkout-db-connection">
     Verify checkout database</Link>
    <Link className="button secondary" href="/admin/checkout-integration">
     Back to integration</Link>
   </div>
  </section>
 </main>;
}
