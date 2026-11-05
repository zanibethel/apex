import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reconcileAdminPaymentReferencesV1}
 from "../src/lib/payments/admin-payment-reference-reconciliation-v1.mjs";

const id=n=>"bbbbaaaa-0000-4000-8000-"+String(n).padStart(12,"0");
const rule=(overrides={})=>({
 id:id(1),version:2,created_at:"2026-11-05T12:00:00.000Z",...overrides,
});
const snapshot=(overrides={})=>({
 id:id(2),rule_id:id(1),rule_version:2,
 gross_sats:"10000",distributable_sats:"9000",
 created_at:"2026-11-05T13:00:00.000Z",...overrides,
});
const transfer=(overrides={})=>({
 id:id(3),snapshot_id:id(2),created_at:"2026-11-05T14:00:00.000Z",
 ...overrides,
});
const fixture=()=>({rules:[rule()],snapshots:[snapshot()],transfers:[transfer()]});

test("in-sample transfer and rule references match without granting settlement authority",()=>{
 const result=reconcileAdminPaymentReferencesV1(fixture());
 assert.equal(result.status,"sampled_references_consistent");
 assert.deepEqual(result.counts,{
  snapshotRuleMatches:1,snapshotRuleOutsideSample:0,
  transferSnapshotMatches:1,transferSnapshotOutsideSample:0,
 });
 assert.deepEqual(result.observedWindow,{
  earliest:"2026-11-05T12:00:00.000Z",
  latest:"2026-11-05T14:00:00.000Z",
 });
 assert.deepEqual(result.reasons,[]);
 for(const key of ["completeHistory","providerEvidenceConnected",
  "independentSettlementVerified","canReleaseCheckout",
  "canCreateInvoice","canSendPayout"])assert.equal(result[key],false,key);
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.counts));
 assert.ok(Object.isFrozen(result.observedWindow));
 assert.ok(Object.isFrozen(result.reasons));
});

test("references not in latest page are unknown, never asserted missing in database",()=>{
 const sample=fixture();
 const result=reconcileAdminPaymentReferencesV1({
  ...sample,
  snapshots:[snapshot({rule_id:id(88)})],
  transfers:[transfer({snapshot_id:id(99)})],
 });
 assert.equal(result.status,"bounded_reference_window");
 assert.equal(result.counts.snapshotRuleOutsideSample,1);
 assert.equal(result.counts.transferSnapshotOutsideSample,1);
 assert.deepEqual(result.reasonCodes,[]);
 assert.equal(JSON.stringify(result).includes("missing"),false);
 assert.equal(result.completeHistory,false);
});

test("different rule version and impossible chronology require review, not automated action",()=>{
 const result=reconcileAdminPaymentReferencesV1({
  rules:[rule({created_at:"2026-11-05T14:00:00.000Z"})],
  snapshots:[snapshot({rule_version:7,created_at:"2026-11-05T13:00:00.000Z"})],
  transfers:[transfer({created_at:"2026-11-05T12:00:00.000Z"})],
 });
 assert.equal(result.status,"review_required");
 for(const code of ["rule_version_conflict","snapshot_before_rule",
  "transfer_before_snapshot"])
  assert.ok(result.reasonCodes.includes(code),code);
 assert.equal(result.canSendPayout,false);
});

test("corrupt money ranges, refs or dates fail closed instead of certifying reconciliation",()=>{
 for(const override of [
  {distributable_sats:"10001"},
  {gross_sats:"-1"},
  {gross_sats:100000000000000000},
  {gross_sats:"2100000000000001"},
  {rule_version:0},{rule_id:"invalid"},
  {created_at:"tomorrow"},{id:"invalid"},
 ]) {
  const result=reconcileAdminPaymentReferencesV1({
   ...fixture(),snapshots:[snapshot(override)],
  });
  assert.equal(result.status,"review_required",JSON.stringify(override));
  assert.ok(result.reasonCodes.includes("invalid_snapshot_reference"));
  assert.equal(result.independentSettlementVerified,false);
 }
 for(const bad of ["invalid",null,"2026-13-01T10:00:00.000Z"]){
  const result=reconcileAdminPaymentReferencesV1({
   ...fixture(),transfers:[transfer({snapshot_id:bad})],
  });
  assert.equal(result.status,"review_required");
  assert.ok(result.reasonCodes.includes("invalid_transfer_reference"));
 }
});

test("partial, denied and 30-row reads never imply complete historical coverage",()=>{
 const data=fixture();
 const denied=reconcileAdminPaymentReferencesV1({...data,snapshots:null});
 assert.equal(denied.status,"unavailable");
 assert.equal(denied.completeHistory,false);
 assert.ok(denied.reasonCodes.includes("invalid_sample"));
 const full=reconcileAdminPaymentReferencesV1({
  ...data,rules:Array.from({length:30},(_,i)=>rule({
   id:id(100+i),version:2,
  })),
 });
 assert.equal(full.status,"bounded_reference_window");
 assert.equal(full.limitedSample,true);
 assert.equal(full.counts.snapshotRuleOutsideSample,1);
 const tooMany=reconcileAdminPaymentReferencesV1({
  ...data,transfers:Array.from({length:31},(_,i)=>transfer({
   id:id(i+100),snapshot_id:id(2),
  })),
 });
 assert.equal(tooMany.status,"unavailable");
 for(const bound of [0,101,1.2,NaN])
  assert.throws(()=>reconcileAdminPaymentReferencesV1(data,{maxRows:bound}),RangeError);
});

test("admin route only expands existing RLS-protected column selections",()=>{
 const page=readFileSync("src/app/admin/payment-monitor/page.tsx","utf8");
 const helperSource=readFileSync(
  "src/lib/payments/admin-payment-reference-reconciliation-v1.mjs","utf8");
 assert.match(page,/reconcileAdminPaymentReferencesV1/);
 assert.match(page,/id,snapshot_id,state,amount_sats,created_at/);
 assert.match(page,/id,rule_id,rule_version,gross_sats,distributable_sats,created_at/);
 assert.match(page,/Payment record relationships/);
 assert.match(page,/not evidence of a missing database row/);
 assert.match(page,/not an immutable audit history/);
 assert.match(page,/isVerifiedPlatformAdmin\(identity\.user\)/);
 assert.match(page,/robots:\{index:false,follow:false\}/);
 const allowed='client.rpc("get_admin_checkout_journal_overview")';
 assert.equal(page.split(allowed).length,2);
 assert.doesNotMatch(page.replace(allowed,""),
  /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(|service_role|SUPABASE_SECRET|fetch\(|createInvoice\(|createPayout\(/);
 assert.doesNotMatch(helperSource,
  /\bfetch\(|console\.|\.insert\(|\.update\(|\.delete\(|process\.env|createInvoice\(|createPayout\(/);
});
