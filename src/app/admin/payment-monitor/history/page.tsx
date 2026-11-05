import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {scanAdminPaymentHistoryV1}
 from "@/lib/payments/admin-payment-history-scan-v1.mjs";

export const dynamic="force-dynamic";
export const metadata={
 title:"Historical Payment Audit | Apex Admin",
 robots:{index:false,follow:false},
};

// Admin-initiated, bounded scan. No timer, cron, provider calls or writes.
const PAGE_SIZE=250;
const MAX_ROWS=5000;
type PageRequest={
 kind:"rules"|"snapshots"|"transfers",
 offset:number,limit:number,asOf:string,
};

export default async function PaymentHistoryAudit(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:identity,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(identity.user))
  redirect("/admin/sign-in");

 // Preserve RLS and select only the relationship fields needed for the
 // audit. A missing/denied page yields no partial result or inferred payment.
 const readPage=async({kind,offset,limit,asOf}:PageRequest)=>{
  if(kind==="rules"){
   const result=await client.from("payout_rules")
    .select("id,scope_id,scope_type,version,created_at",{count:"exact"})
    .lte("created_at",asOf)
    .order("created_at",{ascending:false})
    .order("id",{ascending:false})
    .range(offset,offset+limit-1);
   return result;
  }
  if(kind==="snapshots"){
   return client.from("payment_allocation_snapshots")
    .select("id,rule_id,rule_version,gross_sats,distributable_sats,created_at",
     {count:"exact"})
    .lte("created_at",asOf)
    .order("created_at",{ascending:false})
    .order("id",{ascending:false})
    .range(offset,offset+limit-1);
  }
  return client.from("payout_transfer_records")
   .select("id,snapshot_id,state,amount_sats,created_at",{count:"exact"})
   .lte("created_at",asOf)
   .order("created_at",{ascending:false})
   .order("id",{ascending:false})
   .range(offset,offset+limit-1);
 };
 const report=await scanAdminPaymentHistoryV1({
  readPage,asOf:new Date().toISOString(),
  pageSize:PAGE_SIZE,maxRows:MAX_ROWS,
 });
 const reasons:{
  [key:string]:string
 }={
  report_read_failed:"A reporting page was unavailable or access was denied.",
  history_limit_exceeded:"History exceeds the review limit. No partial audit is accepted.",
  history_changed_during_read:"Source history changed during review. Run a new review later.",
  history_page_incomplete:"One or more reporting pages were incomplete.",
  history_duplicate_identity:"Duplicate identifiers were detected in the report.",
  history_order_changed:"Reporting pages did not maintain a consistent order.",
  invalid_history_row:"A reporting row failed structural checks.",
  recorded_relationship_review_required:"Recorded relationships need independent review.",
 };
 const problems=(report.reasonCodes as string[]).map(
  code=>reasons[code]??"Historical reporting requires review.");
 const count=(n:number|null)=>n===null?"Unavailable":n.toLocaleString("en-US");
 const observed=report.observations as
  Record<string,number>|null;
 const checks=observed?[
  ["Unresolved rule references",observed.unresolvedRuleReferences],
  ["Unresolved allocation references",observed.unresolvedSnapshotReferences],
  ["Rule version conflicts",observed.ruleVersionConflicts],
  ["Unexpected record chronology",
   observed.snapshotBeforeRule+observed.transferBeforeSnapshot],
  ["Invalid stored records",observed.invalidRuleRows+
   observed.invalidSnapshotRows+observed.invalidTransferRows],
  ["Transfer amount conflicts",observed.transferAmountMismatches],
 ]:[];

 return <main className="container supplier-shell apex-branded-dashboard"
  style={{minWidth:0,overflowWrap:"anywhere"}}>
  <Link className="back" href="/admin/payment-monitor">← Payment monitor</Link>
  <p className="eyebrow">APEX / ADMIN ONLY / READ-ONLY</p>
  <h1>Historical payment record review</h1>
  <p className="notice">This reads authorized reporting history up to
   {" "}{MAX_ROWS.toLocaleString("en-US")} records per source. It does not
   submit invoices, contact BTCPay, execute payouts or verify wallet receipts.
   The scan is bounded and is not a transactionally consistent database
   snapshot. Live checkout remains disabled.</p>
  <section className="supplier-panel" style={{maxWidth:"none",marginBottom:18}}
   aria-label="Historical reporting scan status">
   <h2>Historical scan status</h2>
   <p role="status"><strong>{report.status==="unavailable"
    ?"Unavailable — no partial audit accepted"
    :report.status==="review_required"
     ?"Recorded relationship anomalies require review"
     :"Accessible history pages scanned — payment settlement unverified"}
   </strong></p>
   <ul className="supplier-stores">
    <li><span>Rule records read</span>
     <strong>{count(report.inspected.rules)}</strong></li>
    <li><span>Allocation snapshots read</span>
     <strong>{count(report.inspected.snapshots)}</strong></li>
    <li><span>Transfer records read</span>
     <strong>{count(report.inspected.transfers)}</strong></li>
   </ul>
   {problems.length>0?<ul className="notice">
    {problems.map((problem:string)=><li key={problem}>{problem}</li>)}
   </ul>:<p className="notice">No relationship conflicts detected in the
    scanned reporting rows. This is not verification of a payment.</p>}
  </section>
  {report.recordsCovered&&observed?<section className="supplier-panel"
   style={{maxWidth:"none",marginBottom:18}} aria-label="Historical relationship findings">
   <h2>Recorded relationship findings</h2>
   <ul className="supplier-stores">
    {checks.map(([label,value])=><li key={String(label)}>
     <span>{label}</span><strong>{value}</strong></li>)}
   </ul>
   <p className="notice">Records observed from{" "}
    {report.observedWindow.earliest??"Unavailable"}{" "}through{" "}
    {report.observedWindow.latest??"Unavailable"}.
    This reflects timestamps on reporting rows, not blockchain event history.
   </p>
  </section>:null}
  <section className="supplier-panel" style={{maxWidth:"none"}}
   aria-label="Payment verification limitations">
   <h2>What this does not verify</h2>
   <p className="notice">Independent BTCPay invoice readback, signed payment
    events, on-chain receipts, wallet balances, recipient-specific allocation
    totals and cross-source transaction consistency are not established by
    these database reporting rows. Even a clean scan cannot authorize
    customer checkout, invoice submission or supplier payouts.</p>
  </section>
  <p style={{marginTop:18}}>
   <Link className="button secondary" href="/admin/payment-monitor">
    Return to latest payment records</Link>
  </p>
 </main>;
}
