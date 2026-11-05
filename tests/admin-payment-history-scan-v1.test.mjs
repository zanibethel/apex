import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {scanAdminPaymentHistoryV1}
 from "../src/lib/payments/admin-payment-history-scan-v1.mjs";

const id=i=>"cc00aa00-0000-4000-8000-"+String(i).padStart(12,"0");
const at=i=>new Date(Date.UTC(2026,10,5,10,i,0)).toISOString();
const rule=(i,overrides={})=>({
 id:id(i),scope_id:id(80+i),scope_type:"storefront",
 version:1,created_at:at(i),...overrides,
});
const snapshot=(i,ruleId,overrides={})=>({
 id:id(i),rule_id:id(ruleId),rule_version:1,
 gross_sats:"10000",distributable_sats:"9500",
 created_at:at(i),...overrides,
});
const transfer=(i,snapshotId,overrides={})=>({
 id:id(i),snapshot_id:id(snapshotId),state:"pending",
 amount_sats:"5000",created_at:at(i),...overrides,
});
const valid=()=>({
 rules:[rule(2),rule(1)],
 snapshots:[snapshot(5,1),snapshot(4,2)],
 transfers:[transfer(8,5),transfer(7,4)],
});
const asOf="2026-11-05T23:00:00.000Z";
function reader(records,{onRead}={}){
 const pages={};
 return async({kind,offset,limit,asOf:cutoff})=>{
  assert.equal(cutoff,asOf);
  const key=kind+":"+offset;pages[key]=(pages[key]??0)+1;
  if(onRead){
   const result=onRead({kind,offset,limit,calls:pages[key],records});
   if(result!==undefined)return result;
  }
  const rows=records[kind];
  return {data:rows.slice(offset,offset+limit).map(x=>({...x})),
   count:rows.length,error:null};
 };
}
const scan=(records,opts={})=>scanAdminPaymentHistoryV1({
 readPage:reader(records,opts),asOf,pageSize:2,maxRows:6,
});

test("walks each reporting page, reconciles complete bounded accessible history",async()=>{
 const data=valid();
 const res=await scan(data);
 assert.equal(res.status,"bounded_history_read_complete");
 assert.deepEqual(res.inspected,{rules:2,snapshots:2,transfers:2});
 for(const count of Object.values(res.observations))assert.equal(count,0);
 assert.equal(res.recordsCovered,true);
 assert.equal(res.observedWindow.earliest,at(1));
 assert.equal(res.observedWindow.latest,at(8));
 for(const flag of ["pointInTimeSnapshotVerified",
  "independentSettlementVerified","canReleaseCheckout","canCreateInvoice",
  "canSendPayout"])assert.equal(res[flag],false,flag);
 assert.ok(Object.isFrozen(res));
 assert.ok(Object.isFrozen(res.inspected));
 assert.ok(Object.isFrozen(res.observations));
});

test("paginates beyond the old 30-row window, including last short page",async()=>{
 const d=valid();
 d.rules=[rule(6),rule(4),rule(3),rule(2),rule(1)];
 const r=await scan(d);
 assert.equal(r.status,"bounded_history_read_complete");
 assert.equal(r.inspected.rules,5);
 assert.equal(r.observations.unresolvedRuleReferences,0);
});
test("empty accessible reporting history is not a payment or sale claim",async()=>{
 const r=await scan({rules:[],snapshots:[],transfers:[]});
 assert.equal(r.status,"bounded_history_read_complete");
 assert.deepEqual(r.inspected,{rules:0,snapshots:0,transfers:0});
 assert.equal(r.observedWindow.earliest,null);
 assert.equal(r.observedWindow.latest,null);
 assert.equal(r.independentSettlementVerified,false);
});

test("existing provider-agnostic database conflicts require manual review",async()=>{
 const d=valid();
 d.snapshots[0].rule_version=2;
 d.snapshots[0].created_at=at(9);
 d.transfers[1].amount_sats="10000";
 const r=await scan(d);
 assert.equal(r.status,"review_required");
 assert.equal(r.observations.ruleVersionConflicts,1);
 assert.equal(r.observations.transferBeforeSnapshot,1);
 assert.equal(r.observations.transferAmountMismatches,1);
 assert.ok(r.reasonCodes.includes("recorded_relationship_review_required"));
 assert.equal(r.canReleaseCheckout,false);
});
test("unmatched references are explicitly unresolved within authorized history",async()=>{
 const d=valid();
 d.snapshots[0].rule_id=id(99);
 d.transfers[1].snapshot_id=id(88);
 const r=await scan(d);
 assert.equal(r.status,"review_required");
 assert.equal(r.observations.unresolvedRuleReferences,1);
 assert.equal(r.observations.unresolvedSnapshotReferences,1);
 assert.equal(r.pointInTimeSnapshotVerified,false);
});

test("invalid money, rule refs and transfer status are not accepted as clean",async()=>{
 const d=valid();
 d.snapshots[0].distributable_sats="11000";
 d.rules[0].scope_type="unknown";
 d.transfers[0].state="paid";
 const r=await scan(d);
 assert.equal(r.status,"review_required");
 assert.equal(r.observations.invalidRuleRows,1);
 assert.equal(r.observations.invalidSnapshotRows,1);
 assert.equal(r.observations.invalidTransferRows,1);
});
test("missing or denied middle page fails closed with no partial totals",async()=>{
 const d=valid();d.rules=[rule(6),rule(5),rule(4),rule(3),rule(2)];
 const r=await scanAdminPaymentHistoryV1({
  readPage:reader(d,{onRead:({kind,offset})=>
   kind==="rules"&&offset===2?{data:null,count:null,error:{code:"denied"}}:undefined}),
  asOf,pageSize:2,maxRows:6,
 });
 assert.equal(r.status,"unavailable");
 assert.deepEqual(r.inspected,{rules:null,snapshots:null,transfers:null});
 assert.equal(r.recordsCovered,false);
 assert.deepEqual(r.reasonCodes,["report_read_failed"]);
 assert.equal(JSON.stringify(r).includes(id(6)),false);
});
test("over-limit and changing count fail without displaying partial history",async()=>{
 const d=valid();d.rules=Array.from({length:7},(_,i)=>rule(i+1)).reverse();
 const exceed=await scan(d);
 assert.equal(exceed.status,"unavailable");
 assert.deepEqual(exceed.reasonCodes,["history_limit_exceeded"]);
 d.rules=d.rules.slice(0,5);
 const changing=await scan(d,{onRead:({kind,offset,records})=>{
  if(kind==="rules"&&offset===2)
   return {data:records.rules.slice(2,4),count:6,error:null};
 }});
 assert.equal(changing.status,"unavailable");
 assert.deepEqual(changing.reasonCodes,["history_changed_during_read"]);
});
test("cross-page duplicates and misordered pages reject entire history",async()=>{
 const d=valid();d.rules=[rule(5),rule(4),rule(4),rule(1)];
 const duplicate=await scan(d);
 assert.equal(duplicate.status,"unavailable");
 assert.deepEqual(duplicate.reasonCodes,["history_duplicate_identity"]);
 d.rules=[rule(5),rule(3),rule(4),rule(1)];
 const outOfOrder=await scan(d);
 assert.equal(outOfOrder.status,"unavailable");
 assert.deepEqual(outOfOrder.reasonCodes,["history_order_changed"]);
});
test("changed first page on verification re-read denies the scan",async()=>{
 const data=valid();let changed=false;
 const readPage=reader(data,{onRead:({kind,offset,calls})=>{
  if(kind==="rules"&&offset===0&&calls===2&&!changed){
   changed=true;return {data:[{...rule(2),version:3},rule(1)],
    count:2,error:null};
  }
 }});
 const r=await scanAdminPaymentHistoryV1({
  readPage,asOf,pageSize:2,maxRows:6,
 });
 assert.equal(r.status,"unavailable");
 assert.deepEqual(r.reasonCodes,["history_changed_during_read"]);
});
test("invalid scan parameters reject before any database or provider call",async()=>{
 let calls=0;const readPage=async()=>{calls++;return {data:[],count:0};};
 for(const overrides of [{asOf:"not-a-date"},{pageSize:0},
  {pageSize:501},{maxRows:5001},{pageSize:3,maxRows:5}]){
  await assert.rejects(()=>scanAdminPaymentHistoryV1({
   readPage,asOf,pageSize:2,maxRows:6,...overrides,
  }),TypeError);
 }
 assert.equal(calls,0);
});
test("admin-only history route uses RLS reads, no service role and no execution",()=>{
 const page=readFileSync(
  "src/app/admin/payment-monitor/history/page.tsx","utf8");
 const monitor=readFileSync("src/app/admin/payment-monitor/page.tsx","utf8");
 const scanSource=readFileSync(
  "src/lib/payments/admin-payment-history-scan-v1.mjs","utf8");
 assert.match(page,/createSupplierServerClient\(\)/);
 assert.match(page,/auth\.getUser\(\)/);
 assert.match(page,/isVerifiedPlatformAdmin\(identity\.user\)/);
 assert.match(page,/dynamic="force-dynamic"/);
 assert.match(page,/index:false,follow:false/);
 for(const name of ["payout_rules","payment_allocation_snapshots","payout_transfer_records"]){
  assert.ok(page.includes('from("'+name+'")'),name);
 }
 assert.match(page,/count:"exact"/);
 assert.match(page,/\.lte\("created_at",asOf\)/);
 assert.match(page,/\.order\("id",\{ascending:false\}\)/);
 assert.match(page,/\.range\(offset,offset\+limit-1\)/);
 assert.match(monitor,/href="\/admin\/payment-monitor\/history"/);
 assert.doesNotMatch(page,/service_role|SUPABASE_SECRET|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(|\bfetch\(|createInvoice|createPayout/);
 assert.doesNotMatch(scanSource,/service_role|process\.env|console\.|\bfetch\(|\.insert\(|\.update\(|\.delete\(/);
});
