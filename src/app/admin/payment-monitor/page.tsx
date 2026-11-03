import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {
 summarizeAdminPaymentMonitor,recordedTransferLabel,recordedRuleLabel,
} from "@/lib/payments/admin-payment-monitor.mjs";

export const dynamic="force-dynamic";
export const metadata={
 title:"Private Payment Monitor | Apex",
 robots:{index:false,follow:false},
};
const LIMIT=30;

function formatTime(value:string|null){
 if(typeof value!=="string")return "Not available";
 const date=new Date(value);
 return Number.isNaN(date.valueOf())?"Not available":
  date.toLocaleString("en-US",{timeZone:"America/Chicago",
   year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
}
function safeSats(value:unknown){
 if(typeof value==="number"&&Number.isSafeInteger(value)&&value>=0)
  return value.toLocaleString("en-US");
 if(typeof value==="string"&&/^\d{1,16}$/.test(value))return value;
 return "Not available";
}

export default async function AdminPaymentMonitor(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:identity,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(identity.user))
  redirect("/admin/sign-in");

 // Only the signed-in admin's RLS-scoped client is used. This page cannot
 // access the ephemeral/regtest-only BTCPay tables or any provider keys.
 const [rulesResult,transfersResult,snapshotsResult,storesResult]=await Promise.all([
  client.from("payout_rules")
   .select("id,scope_id,scope_type,version,status,created_at")
   .order("created_at",{ascending:false}).limit(LIMIT),
  client.from("payout_transfer_records")
   .select("id,state,amount_sats,created_at")
   .order("created_at",{ascending:false}).limit(LIMIT),
  client.from("payment_allocation_snapshots")
   .select("id,created_at")
   .order("created_at",{ascending:false}).limit(LIMIT),
  client.from("stores")
   .select("id,display_name")
   .order("display_name").limit(100),
 ]);
 const rules=rulesResult.error?null:rulesResult.data;
 const transfers=transfersResult.error?null:transfersResult.data;
 const snapshots=snapshotsResult.error?null:snapshotsResult.data;
 const summary=summarizeAdminPaymentMonitor({rules,transfers,snapshots});
 const storeNames=new Map((storesResult.error?[]:storesResult.data??[])
   .map(store=>[store.id,store.display_name]));
 const recordedAttention=summary.transfers.available?
  (summary.transfers.states.failed??0)+(summary.transfers.states.reversed??0)+
  summary.transfers.unrecognized:null;

 return <main className="container supplier-shell apex-branded-dashboard"
   style={{minWidth:0,overflowWrap:"anywhere"}}>
  <Link className="back" href="/admin">← Admin dashboard</Link>
  <p className="eyebrow">APEX / PLATFORM ADMIN / READ-ONLY</p>
  <h1 style={{fontSize:"clamp(2rem, 6vw, 3.3rem)"}}>Payment monitoring</h1>
  <p className="notice"><strong>Live checkout and payment execution remain disabled.</strong>
   This view reads existing admin-scoped reporting tables only. It has no
   wallet access, invoice-creation controls, payout execution, key management
   or operator-recovery actions.</p>
  <section className="supplier-panel" aria-label="Payment safety gates"
   style={{maxWidth:"none",marginBottom:22}}>
   <h2>Payment system gates</h2>
   <ul className="supplier-stores">
    <li><span>Public Bitcoin checkout</span><strong>Disabled</strong></li>
    <li><span>Live BTCPay / Prism evidence feed</span><strong>Not connected</strong></li>
    <li><span>Invoice or payout actions</span><strong>Not available</strong></li>
    <li><span>Recovery approval actions</span><strong>Not available</strong></li>
   </ul>
   <p className="notice">Passing disposable regtest tests does not establish
    live merchant settlement, supplier payout, or release approval.</p>
  </section>
  <section aria-label="Recorded reporting summary"
   style={{display:"grid",
    gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 230px), 1fr))",
    gap:14,marginBottom:28}}>
   <article className="supplier-panel" style={{minWidth:0}}>
    <h2>Rule records</h2>
    <p style={{fontSize:28,fontWeight:800,margin:"12px 0"}}>
     {summary.rules.available?summary.rules.shown:"Unavailable"}</p>
    <p className="notice">{summary.rules.available?
      "Most recent proposed or recorded allocation rules":
      "No authorized reporting readback"}</p>
   </article>
   <article className="supplier-panel" style={{minWidth:0}}>
    <h2>Transfer records</h2>
    <p style={{fontSize:28,fontWeight:800,margin:"12px 0"}}>
     {summary.transfers.available?summary.transfers.shown:"Unavailable"}</p>
    <p className="notice">Database record count, not on-chain transfers verified.</p>
   </article>
   <article className="supplier-panel" style={{minWidth:0}}>
    <h2>Review attention</h2>
    <p style={{fontSize:28,fontWeight:800,margin:"12px 0"}}>
     {recordedAttention??"Unavailable"}</p>
    <p className="notice">Recorded failed, reversed or unrecognized states
     in the current sample. No automatic retry.</p>
   </article>
   <article className="supplier-panel" style={{minWidth:0}}>
    <h2>Allocation snapshots</h2>
    <p style={{fontSize:28,fontWeight:800,margin:"12px 0"}}>
     {summary.snapshots.available?summary.snapshots.shown:"Unavailable"}</p>
    <p className="notice">Recorded snapshots only; no confirmed Bitcoin receipt.</p>
   </article>
  </section>
  <section className="supplier-panel" style={{maxWidth:"none",marginBottom:24}}>
   <h2>Recent allocation rules</h2>
   <p className="notice">Up to {LIMIT} newest records. Rule state describes the
    database proposal, not the active BTCPay/Prism configuration.</p>
   {!summary.rules.available?
     <p role="status">Payout-rule reporting is unavailable or not installed.
      No payment readiness is inferred.</p>:
    !rules?.length?<p>No recorded rules in this view.</p>:
    <ul className="supplier-stores">
     {rules.map(rule=><li key={rule.id} style={{gap:16,flexWrap:"wrap"}}>
      <span><strong>{rule.scope_type==="storefront"
        ?storeNames.get(rule.scope_id)??"Storefront"
        :rule.scope_type==="supplier"?"Supplier scope":"Product scope"}</strong>
       {" · "}Version {rule.version}
       <small style={{display:"block"}}>{formatTime(rule.created_at)}</small>
      </span>
      <strong>{recordedRuleLabel(rule.status)}</strong>
     </li>)}
    </ul>}
  </section>
  <section className="supplier-panel" style={{maxWidth:"none",marginBottom:24}}>
   <h2>Recent transfer journal</h2>
   <p className="notice">Up to {LIMIT} newest records. These are the stored
    payout statuses only; even a recorded confirmed state is not independent
    blockchain or recipient-wallet verification.</p>
   {!summary.transfers.available?
     <p role="status">Transfer reporting is unavailable or not installed.
      No transfers or settlements can be confirmed from this view.</p>:
    !transfers?.length?<p>No recorded transfer entries in this view.</p>:
    <ul className="supplier-stores">
     {transfers.map(transfer=><li key={transfer.id}
       style={{gap:16,flexWrap:"wrap"}}>
      <span><strong>{safeSats(transfer.amount_sats)} sats recorded</strong>
       <small style={{display:"block"}}>{formatTime(transfer.created_at)}</small>
      </span>
      <strong>{recordedTransferLabel(transfer.state)}</strong>
     </li>)}
    </ul>}
  </section>
  <p className="notice">Counts are limited to the latest {LIMIT} records per
   reporting table, not account-wide totals. Missing tables, denied reads,
   partial records and unknown statuses must not be treated as successful
   payments.</p>
  <p><Link className="button secondary" href="/admin/splits">
    Review allocation proposals</Link>{" "}
   <Link className="button secondary" href="/admin/checkout-readiness">
    Review checkout readiness</Link></p>
 </main>;
}
