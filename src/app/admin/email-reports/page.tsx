import {createHash} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {activateSupplierReportEmailSender} from "./actions";
export const dynamic="force-dynamic";
export const metadata={
 title:"Daily Email Sender | Apex Admin",robots:{index:false,follow:false},
};
export default async function AdminSupplierEmailReports({
 searchParams,
}:{searchParams:Promise<{result?:string}>}){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");
 const token=process.env.APEX_REPORT_DISPATCH_TOKEN;
 const resend=process.env.RESEND_REPORTS_API_KEY;
 const cron=process.env.CRON_SECRET;
 const envConfigured=Boolean(token&&/^[0-9a-f]{64}$/.test(token)
  &&resend?.startsWith("re_")&&cron&&cron.length>=24);
 const digest=token&&/^[0-9a-f]{64}$/.test(token)?
  createHash("sha256").update(token,"utf8").digest("hex"):null;
 const record=digest?await client.rpc(
  "get_admin_daily_mail_sender_readiness",{p_expected_sha256:digest}):null;
 const activated=Boolean(digest&&!record?.error
  &&record?.data?.sender_activated===true);
 const params=await searchParams;
 return <main className="container supplier-shell apex-branded-dashboard"
  style={{minWidth:0}}>
  <Link href="/admin" className="back">← Admin dashboard</Link>
  <p className="eyebrow">APEX / ADMIN / NOTIFICATIONS</p>
  <h1>Daily supplier email reports</h1>
  <p className="lead">Keep Proton as the incoming mailbox provider and use
   Resend to send opted-in supplier members their previous-day summaries
   before 8:00 AM Central.</p>
  <section className="supplier-panel" style={{maxWidth:"none"}}>
   <h2>Secure sending connection</h2>
   <p><strong>Sending domain:</strong> apexanabolics.co</p>
   <p><strong>From:</strong> reports@apexanabolics.co</p>
   <p><strong>Server credentials:</strong>
    {envConfigured?" Configured":" Missing or unavailable"}</p>
   <p><strong>Worker authorization:</strong>
    {activated?" Active and matches the protected server token":
     " Not activated"}</p>
   <p className="notice">Activation registers a one-way SHA-256 fingerprint
    of the server's existing credential. No API keys or plaintext tokens
    are stored in the reporting database. Only verified platform admins
    can activate this sender.</p>
   {params?.result==="activated"&&<p role="status">
    Secure sender activated. Supplier emails remain opt-in.</p>}
   {params?.result==="unconfigured"&&<p role="alert">
    Server credentials must be configured before activation.</p>}
   {params?.result==="failed"&&<p role="alert">
    Activation could not be verified. No new email privileges were granted.</p>}
   {!activated&&<form action={activateSupplierReportEmailSender}>
    <button className="button primary" type="submit"
     disabled={!envConfigured}>
     Activate daily email delivery
    </button>
   </form>}
   {activated&&<p className="notice">
    The worker is authorized. Only supplier members who enabled email
    reports and confirmed their login email are eligible.</p>}
  </section>
  <section className="supplier-panel" style={{maxWidth:"none",marginTop:20}}>
   <h2>Delivery schedule and safeguards</h2>
   <p>Daily snapshots run at 10:00 UTC; the Resend delivery route is scheduled
    at 11:00 UTC. Both occur before 8:00 AM Central, including daylight
    saving time and a possible hourly scheduling window.</p>
   <p className="notice">An accepted email is not necessarily delivered.
    Final mailbox delivery must be confirmed through Resend delivery events.
    This page never creates orders, invoices, product listings or postage
    labels.</p>
   <div className="actions">
    <Link className="button secondary" href="/supplier/reports/daily">
     Supplier report preferences</Link>
    <Link className="button secondary" href="/supplier/usps">
     Supplier USPS readiness</Link>
   </div>
  </section>
 </main>;
}
