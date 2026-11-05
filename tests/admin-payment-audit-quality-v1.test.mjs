import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessAdminPaymentAuditSample}
 from "../src/lib/payments/admin-payment-audit-quality-v1.mjs";

const uuid=n=>"aaaabbbb-0000-4000-8000-"+String(n).padStart(12,"0");
const at="2026-11-05T14:30:00.000Z";
const rule=n=>({id:uuid(n),scope_id:uuid(100+n),
 scope_type:"storefront",version:1,status:"draft",created_at:at});
const transfer=n=>({id:uuid(n),state:"pending",amount_sats:"125",
 created_at:at});
const snapshot=n=>({id:uuid(n),created_at:at});
const sample=()=>({rules:[rule(1)],transfers:[transfer(2)],
 snapshots:[snapshot(3)]});
const audit=raw=>assessAdminPaymentAuditSample(raw);

test("normal samples are only observations, never independent payment evidence",()=>{
 const result=audit(sample());
 assert.equal(result.status,"recorded_sample_only");
 assert.deepEqual(result.inspected,{rules:1,transfers:1,snapshots:1});
 assert.deepEqual(result.reasons,[]);
 for(const key of ["sourceCoverageVerified","providerSettlementVerified",
 "canReleaseCheckout","canCreateInvoice","canApprovePayout"])
  assert.equal(result[key],false,key);
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.inspected));
 assert.ok(Object.isFrozen(result.reasonCodes));
 assert.ok(Object.isFrozen(result.reasons));
});

test("data source errors are unavailable, not a clean or zero-row payment view",()=>{
 const missing=audit();
 assert.equal(missing.status,"unavailable");
 assert.deepEqual(missing.inspected,{
  rules:null,transfers:null,snapshots:null,
 });
 assert.ok(missing.reasonCodes.includes("rule_read_unavailable"));
 assert.ok(missing.reasonCodes.includes("transfer_read_unavailable"));
 assert.ok(missing.reasonCodes.includes("snapshot_read_unavailable"));
 const partial=audit({...sample(),transfers:null});
 assert.equal(partial.status,"unavailable");
 assert.equal(partial.inspected.transfers,null);
 const empty=audit({rules:[],transfers:[],snapshots:[]});
 assert.equal(empty.status,"recorded_sample_only");
 assert.equal(empty.providerSettlementVerified,false);
});

test("a full sample does not imply full source coverage",()=>{
 const full=audit({
  rules:Array.from({length:30},(_,i)=>rule(i+1)),
  transfers:[transfer(40)],snapshots:[],
 });
 assert.equal(full.status,"bounded_sample");
 assert.ok(full.reasonCodes.includes("rule_sample_limit"));
 assert.equal(full.sourceCoverageVerified,false);
 assert.equal(full.inspected.rules,30);
 const huge=audit({
  rules:Array.from({length:31},(_,i)=>rule(i+1)),
  transfers:[],snapshots:[],
 });
 assert.equal(huge.status,"unavailable");
 assert.ok(huge.reasonCodes.includes("invalid_sample"));
 assert.equal(huge.inspected.rules,null);
 for(const bad of [0,101,1.5,NaN])assert.throws(
  ()=>assessAdminPaymentAuditSample(sample(),{maxRows:bad}),RangeError);
});

test("duplicates, malformed metadata and unknown states require manual review",()=>{
 const input={
  rules:[rule(1),{...rule(1),status:"not-a-rule"}],
  transfers:[transfer(2),{...transfer(2),state:"paid",amount_sats:-1}],
  snapshots:[snapshot(3),snapshot(3)],
 };
 const result=audit(input);
 assert.equal(result.status,"review_required");
 for(const code of [
  "duplicate_rule_id","unrecognized_rule_state",
  "duplicate_transfer_id","unrecognized_transfer_state",
  "invalid_transfer_record","duplicate_snapshot_id",
 ])assert.ok(result.reasonCodes.includes(code),code);
 assert.equal(result.canReleaseCheckout,false);
 assert.equal(result.canApprovePayout,false);
});

test("bad timestamps, identifiers, scopes and amounts are not ignored",()=>{
 const result=audit({
  rules:[{...rule(1),scope_id:"other-store",version:0,
   created_at:"tomorrow"}],
  transfers:[{...transfer(2),id:"",amount_sats:"2100000000000001",
   created_at:"undefined"}],
  snapshots:[{...snapshot(3),created_at:null}],
 });
 assert.equal(result.status,"review_required");
 assert.ok(result.reasonCodes.includes("invalid_rule_record"));
 assert.ok(result.reasonCodes.includes("invalid_transfer_record"));
 assert.ok(result.reasonCodes.includes("invalid_snapshot_record"));
 for(const amount of ["-1","1.1","01","99999999999999999",
  9007199254740992,Infinity,null]){
  const v=audit({...sample(),transfers:[{...transfer(2),amount_sats:amount}]});
  assert.ok(v.reasonCodes.includes("invalid_transfer_record"),String(amount));
 }
});

test("dashboard remains server-only, read-only and explicitly non-settlement",()=>{
 const page=readFileSync("src/app/admin/payment-monitor/page.tsx","utf8");
 const source=readFileSync(
  "src/lib/payments/admin-payment-audit-quality-v1.mjs","utf8");
 assert.match(page,/isVerifiedPlatformAdmin\(identity\.user\)/);
 assert.match(page,/assessAdminPaymentAuditSample/);
 assert.match(page,/Payment record audit quality/);
 assert.match(page,/wallet receipts/);
 assert.match(page,/full coverage unknown/);
 assert.match(page,/not payment proof/);
 assert.match(page,/robots:\{index:false,follow:false\}/);
 const allowed='client.rpc("get_admin_checkout_journal_overview")';
 assert.equal(page.split(allowed).length,2);
 assert.doesNotMatch(page.replace(allowed,""),
  /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(|service_role|SUPABASE_SECRET|fetch\(|createInvoice\(|createPayout\(/);
 assert.doesNotMatch(source,/\bfetch\(|console\.|\.insert\(|\.update\(|\.delete\(|process\.env|createInvoice\(|createPayout\(/);
});
