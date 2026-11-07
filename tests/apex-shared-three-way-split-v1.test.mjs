import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 buildApexSharedThreeWayDraftV1,
 snapshotApexSharedThreeWayRegtestV1,
} from "../src/lib/payments/apex-shared-three-way-split-v1.mjs";

const id=n=>"ab000000-0000-4000-8000-"+String(n).padStart(12,"0");
const storeId=id(1);
const recipientIds={apex:id(2),lily:id(3),tierra:id(4)};
const draft=share=>buildApexSharedThreeWayDraftV1({
 storeId,recipientIds,lilyBasisPoints:share,
});
const preview=(rule,version=1,amountSats=1000000n)=>snapshotApexSharedThreeWayRegtestV1({
 draft:rule,version,orderReference:"fake-regtest-001",amountSats,
 network:"regtest",testOnly:true,
});

test("single shared BTCPay store starts at 10% Apex / 45% Lily / 45% Tierra",()=>{
 const r=draft(4500);
 assert.equal(r.scope_type,"storefront");
 assert.equal(r.scope_id,storeId);
 assert.equal(r.platform_basis_points,1000);
 assert.equal(r.supplier_pool_basis_points,9000);
 assert.deepEqual(r.allocations.map(x=>x.basis_points),[1000,4500,4500]);
 assert.deepEqual(r.allocations.map(x=>x.role),["apex","lily","tierra"]);
 assert.deepEqual(r.allocations.map(x=>x.recipient_id),[
  recipientIds.apex,recipientIds.lily,recipientIds.tierra,
 ]);
 assert.equal(r.allocations.reduce((a,x)=>a+x.basis_points,0),10000);
 assert.equal(r.draft_only,true);
 assert.equal(r.canPay,false);
 assert.equal(r.canActivate,false);
 assert.equal(Object.isFrozen(r),true);
 assert.equal(Object.isFrozen(r.allocations[0]),true);
});

test("admin can adjust Lily with Tierra automatically balancing the 90% pool",()=>{
 for(const [lily,expected] of [[1,[1000,1,8999]],[3200,[1000,3200,5800]],
  [6000,[1000,6000,3000]],[8999,[1000,8999,1]]]){
  const r=draft(lily);
  assert.deepEqual(r.allocations.map(x=>x.basis_points),expected);
  assert.equal(r.allocations.reduce((n,x)=>n+x.basis_points,0),10000);
 }
});

test("rejects altered platform share, wrong store, duplicate identities and invalid supplier weights",()=>{
 for(const invalid of [0,9000,-1,9001,4500.5,"4500",NaN,Infinity])
  assert.throws(()=>draft(invalid));
 for(const args of [
  {storeId:"invalid",recipientIds},
  {storeId,recipientIds:{...recipientIds,lily:recipientIds.apex}},
  {storeId,recipientIds:{apex:id(2),lily:id(3)}},
  {storeId,recipientIds:{...recipientIds,unknown:id(5)}},
  {storeId,recipientIds:{...recipientIds,apex:"not-uuid"}},
 ])assert.throws(()=>buildApexSharedThreeWayDraftV1(args));
});

test("versioned synthetic entitlements are immutable and sum exactly in integer satoshis",()=>{
 const initial=preview(draft(4500),1);
 const revised=preview(draft(6000),2);
 assert.deepEqual(initial.allocations.map(x=>x.entitlementSats),["100000","450000","450000"]);
 assert.deepEqual(revised.allocations.map(x=>x.entitlementSats),["100000","600000","300000"]);
 assert.equal(initial.ruleVersion,1);
 assert.equal(revised.ruleVersion,2);
 assert.deepEqual(initial.allocations.map(x=>x.entitlementSats),["100000","450000","450000"]);
 for(const x of [initial,revised]){
  assert.equal(x.allocations.reduce((n,a)=>n+BigInt(a.entitlementSats),0n),BigInt(x.grossSats));
  assert.equal(x.productionReady,false);
  assert.equal(x.prismForwardingVerified,false);
  assert.equal(x.canCreatePayout,false);
  assert.equal(x.canShip,false);
  assert.equal(Object.isFrozen(x.allocations[0]),true);
 }
 const odd=preview(draft(4001),7,1001n);
 assert.equal(odd.allocations.reduce((n,a)=>n+BigInt(a.entitlementSats),0n),1001n);
});

test("refuses forged synthetic snapshot, wrong network and mutated allocation",()=>{
 for(const bad of [
  {network:"mainnet",testOnly:true},
  {network:"regtest",testOnly:false},
  {network:"testnet",testOnly:true},
 ])assert.throws(()=>snapshotApexSharedThreeWayRegtestV1({
  draft:draft(4500),version:1,orderReference:"fake-regtest-001",
  amountSats:1000000n,...bad,
 }));
 assert.throws(()=>preview({...draft(4500),allocations:[
  {...draft(4500).allocations[0],basis_points:1500},
  ...draft(4500).allocations.slice(1),
 ]}));
 assert.throws(()=>preview({...draft(4500),canPay:true}));
 assert.throws(()=>preview(draft(4500),0));
 assert.throws(()=>preview(draft(4500),1,-1n));
});

test("the shared-store template enforces authenticated admins and recipient roles server-side",()=>{
 const action=readFileSync("src/app/admin/splits/configure/actions.ts","utf8");
 assert.match(action,/isVerifiedPlatformAdmin\(data\.user\)/);
 assert.match(action,/template === "apex_shared_three_way_v1"/);
 assert.match(action,/buildApexSharedThreeWayDraftV1\(/);
 assert.match(action,/recipient_type !== \(index === 0 \? "platform" : "supplier"\)/);
 assert.match(action,/p_rule_id: ruleId \|\| null/);
 assert.match(action,/scopeType !== "storefront" \|\| ruleId/);
 const page=readFileSync("src/app/admin/splits/configure/page.tsx","utf8");
 const form=readFileSync("src/app/admin/splits/configure/apex-three-way.tsx","utf8");
 assert.match(page,/ApexThreeWayDraft/);
 assert.match(form,/useState\(4500\)/);
 assert.match(form,/SUPPLIER_POOL_BPS-lilyBasisPoints/);
 assert.match(form,/APEX_MULTI_SPLIT_DRAFT_WRITES_ENABLED|!enabled/);
 assert.match(form,/Save new three-way draft version/);
 assert.doesNotMatch(form,/service_role|NEXT_PUBLIC_.*KEY|createInvoice|sendPayout/);
});
