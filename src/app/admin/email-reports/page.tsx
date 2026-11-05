import {createHash} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {activateSupplierReportEmailSender} from "./actions";
import {parseAdminSupplierMailHealth} from "@/lib/supplier/admin-mail-delivery-health.mjs";
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
 const healthResult=await client.rpc("get_admin_supplier_mail_delivery_health",{p_days:7});
 const health=healthResult.error?null:parseAdminSupplierMailHealth(healthResult.data,7);
 const webhookConfigured=Boolean(process.env.RESEND_REPORT_WEBHOOK_SECRET);
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
    of the server&apos;s existing credential. No API keys or plaintext tokens
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
  <section className="supplier-panel" style={{maxWidth:"none",marginTop:20}}
   aria-label="Resend report delivery health">
   <h2>Delivery monitoring · last 7 days</h2>
   <p className="notice">Signed provider receipts only. Older reports sent
    before the webhook was installed are not counted as failed.
    A delivery event means accepted by the recipient mail server,
    not independently confirmed inbox placement.</p>
   <p><strong>Webhook signing credential:</strong>
    {webhookConfigured?" Configured":" Unavailable"}</p>
   {!health?<p role="alert">The private delivery health summary is unavailable.
    No delivery counts or alerts are assumed.</p>:<>
    {health.alertCount>0?
     <p role="alert"><strong>{health.alertCount}</strong> report
      delivery alert(s) need review.</p>:
     <p role="status">No outstanding alerts in the signed-event journal.</p>}
    <div className="apex-daily-metrics" style={{
     display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",
     gap:12,margin:"16px 0"}}>
     {([
      ["Provider accepted",health.accepted],
      ["Delivered to mail server",health.deliveredToMailServer],
      ["Pending signed event",health.noSignedEvent],
      ["Overdue receipts (3h)",health.receiptOverdue],
      ["Bounced",health.bounced],
      ["Failed",health.failed],
      ["Delayed",health.delayed],
      ["Complaints",health.complained],
      ["Suppressed",health.suppressed],
     ] as [string,number][]).map(([name,count])=>
      <div key={name} style={{padding:14,border:"1px solid #56404f",
       borderRadius:10,background:"#251c27",minWidth:0}}>
       <div style={{fontSize:12,color:"#dbbfd0"}}>{name}</div>
       <strong style={{fontSize:25,fontVariantNumeric:"tabular-nums"}}>{count}</strong>
      </div>)}
    </div>
    <p className="notice"><strong>{health.predatesWebhook}</strong>
     {" "}historical accepted report(s) predate signed monitoring.
     These cannot be marked delivered based on a missing webhook event.</p>
    <p className="notice">Latest signed delivery event:
     {" "}{health.latestSignedEventAt?
       new Date(health.latestSignedEventAt).toLocaleString("en-US",{
        dateStyle:"medium",timeStyle:"short",timeZone:"America/Chicago"
       })+" Central":"No signed events recorded"}.</p>
    <p className="notice">Delivery alerts are read-only. Verify current
     recipient opt-in and provider state before any manual resend.</p>
   </>}
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
