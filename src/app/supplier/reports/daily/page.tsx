import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {previousCentralDate,validReportDate,parseSupplierDailyReport}
 from "@/lib/supplier/daily-order-report.mjs";
import "./daily.css";

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
}:{searchParams:Promise<{date?:string}>}){
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
  const r=await w.client.rpc("get_supplier_daily_order_report",{
   p_store_id:store.id,p_report_date:day,
  });
  return {store,error:r.error,report:r.error?null:
   parseSupplierDailyReport(r.data,store.id,day)};
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
  {results.map(({store,error,report})=><section className="apex-daily-panel"
   key={store.id} aria-label={"Report for "+store.display_name}>
   <h2>{store.display_name}</h2>
   <p className="apex-daily-period">{day} · America/Chicago</p>
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
   Reports are available in the supplier dashboard. Email delivery is not
   active until a verified transactional email sender and recipient preferences
   are configured. Gross sales are not supplier payouts; shipment expenses are
   tracked separately once label purchasing is authorized.
  </p>
  <div className="actions">
   <Link className="button secondary" href="/supplier/usps">USPS fulfillment</Link>
   <Link className="button secondary" href="/supplier/reports">Sales history</Link>
  </div>
 </main>;
}
