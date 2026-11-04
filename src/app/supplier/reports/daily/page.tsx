import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {previousCentralDate,validReportDate,parseSupplierDailyReport,parseSupplierDailyReportEmailPreference}
 from "@/lib/supplier/daily-order-report.mjs";
import "./daily.css";
import {updateSupplierDailyReportEmailPreference} from "./email-actions";

export const dynamic="force-dynamic";
export const metadata={
 title:"Daily Order Report | Apex Supplier",robots:{index:false,follow:false},
};
const money=(n:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(n/100);
const centralTime=(date:string)=>new Date(date).toLocaleString("en-US",{
 timeZone:"America/Chicago",dateStyle:"medium",timeStyle:"short",
});

export default async function DailySupplierReport({
 searchParams,
}:{searchParams:Promise<{date?:string;email?:string}>}){
 const w=await getSupplierWorkspace();
 if(!w)redirect("/supplier/sign-in");
 const args=await searchParams;
 const yesterday=previousCentralDate();
 const requested=args?.date??yesterday;
 const day=requested&&validReportDate(requested)?requested:yesterday;
 if(!day)return <main className="container supplier-shell">
  <h1>Daily report unavailable.</h1>
 </main>;
 const previousDays=Array.from({length:7},(_,i)=>{
  const d=new Date(day+"T00:00:00.000Z");d.setUTCDate(d.getUTCDate()-i);
  return d.toISOString().slice(0,10);
 });
 const results=await Promise.all(w.stores.map(async store=>{
  const [r,pref]=await Promise.all([
   w.client.rpc("get_supplier_daily_order_report",{
    p_store_id:store.id,p_report_date:day,
   }),
   w.client.rpc("get_supplier_daily_report_email_preference",{
    p_store_id:store.id,
   }),
  ]);
  return {store,error:r.error,report:r.error?null:
   parseSupplierDailyReport(r.data,store.id,day),
   emailPreference:pref.error?null:
    parseSupplierDailyReportEmailPreference(pref.data,store.id)};
 }));
 return <main className="container supplier-shell apex-supplier-daily">
  <Link className="back" href="/supplier/reports">← Sales history</Link>
  <p className="eyebrow">APEX / SUPPLIER / DAILY ORDERS</p>
  <h1>Daily order report</h1>
  <p className="lead">Daily reports use verified sales records for the previous
   Central Time calendar day. Report generation is scheduled before 8:00 AM
   America/Chicago; data is never estimated.</p>
  <div className="apex-daily-dates" aria-label="Report date">
   {previousDays.map(date=><Link key={date} href={"/supplier/reports/daily?date="+date}
    aria-current={date===day?"date":undefined}
    className={date===day?"apex-daily-date active":"apex-daily-date"}>
    {date}</Link>)}
  </div>
  {args?.email==="enabled"&&<p role="status" className="apex-daily-email-state">
    Daily email preference enabled for your verified account address. Delivery begins after secure sender activation.
   </p>}
  {args?.email==="disabled"&&<p role="status" className="apex-daily-email-state">
    Daily email reporting disabled for your account.
   </p>}
  {args?.email==="error"&&<p role="alert" className="apex-daily-email-error">
    Could not change your report email setting. Confirm your login email and try again.
   </p>}
  {results.map(({store,error,report,emailPreference})=><section className="apex-daily-panel"
   key={store.id} aria-label={"Report for "+store.display_name}>
   <h2>{store.display_name}</h2>
   <p className="apex-daily-period">{day} · America/Chicago</p>
   <div className="apex-daily-email-preferences">
    <h3>Email me this daily report</h3>
    {!emailPreference?<p role="alert">Email preferences are temporarily unavailable.</p>:
     <>
      <p className="notice">Destination: {w.user.email??"Unverified account email"}.
       Reports are sent only to your confirmed login email, not other supplier members.
      </p>
      <p className="notice">Subscription: {emailPreference.enabled?"Enabled":"Disabled"}
       {" · "}Target delivery: before 8:00 AM Central daily.</p>
      <p className="notice">A subscription does not confirm that a message was sent. Secure delivery must be activated by the administrator.</p>
      <form action={updateSupplierDailyReportEmailPreference}>
       <input type="hidden" name="storeId" value={store.id}/>
       <input type="hidden" name="enabled"
        value={emailPreference.enabled?"false":"true"}/>
       <button className={emailPreference.enabled?"button secondary":"button primary"}
        type="submit" disabled={!emailPreference.verified&&!emailPreference.enabled}>
        {emailPreference.enabled?"Disable daily emails":"Enable daily emails"}
       </button>
      </form>
      {!emailPreference.verified&&<p className="notice">
       Confirm the email on your Apex login before enabling email reports.</p>}
     </>}
   </div>
   {error||!report?<p role="alert">Reporting permissions or saved data
    are unavailable. No figures will be estimated.</p>:
    report.status==="not_generated"?<p role="status">
     The scheduled report for this date has not been generated yet.
     Daily reports will appear here after the scheduled database job runs.
    </p>:<>
     <p className="notice">Generated {centralTime(report.generatedAt)} Central</p>
     <div className="apex-daily-metrics">
      <article><span>Recorded orders</span><strong>{report.recordedOrders}</strong></article>
      <article><span>Confirmed</span><strong>{report.confirmedOrders}</strong></article>
      <article><span>Pending</span><strong>{report.pendingOrders}</strong></article>
      <article><span>Refunded</span><strong>{report.refundedOrders}</strong></article>
      <article><span>Cancelled</span><strong>{report.cancelledOrders}</strong></article>
     </div>
     <dl className="apex-daily-totals">
      <div><dt>Confirmed gross sales</dt><dd>{money(report.confirmedGrossCents)}</dd></div>
      <div><dt>Pending gross</dt><dd>{money(report.pendingGrossCents)}</dd></div>
      <div><dt>Refunded gross</dt><dd>{money(report.refundedGrossCents)}</dd></div>
      <div><dt>Confirmed BTC</dt><dd>{report.confirmedBtcSats.toLocaleString("en-US")} sats</dd></div>
     </dl>
     {report.recordedOrders===0&&<p className="notice">
      No verified orders were recorded for this date. Values are zero, not estimates.</p>}
    </>}
  </section>)}
  <p className="notice apex-daily-disclosure">
   Reports remain available in the supplier dashboard even when email delivery is
   not activated. Email subscriptions require a verified login address; provider
   acceptance is not proof of final inbox delivery. Gross sales are not supplier payouts;
   shipping expenses are tracked separately when label purchasing is authorized.
  </p>
  <div className="actions">
   <Link className="button secondary" href="/supplier/usps">USPS fulfillment</Link>
   <Link className="button secondary" href="/supplier/reports">Sales history</Link>
   <Link className="button secondary" href="/supplier/reports/fulfillment">Cumulative fulfillment review CSV</Link>
   <Link className="button secondary" href="/supplier/reports/reconcile">Download / upload sales review CSV</Link>
  </div>
 </main>;
}
