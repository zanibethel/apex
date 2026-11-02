import test from "node:test";
import assert from "node:assert/strict";
import {snapshotSyntheticAdminSplit} from "../src/lib/payments/synthetic-payout-rule-snapshot.mjs";

const suppliers=[
 "80000000-0000-4000-8000-000000000001",
 "80000000-0000-4000-8000-000000000002",
 "80000000-0000-4000-8000-000000000003",
];
function fixture(percent=9000,version=1){
 return {status:"approved_test_fixture",scope_type:"supplier",
 scope_id:"90000000-0000-4000-8000-000000000001",version,
 allocations:[{recipient_id:suppliers[0],basis_points:percent},
              {recipient_id:suppliers[1],basis_points:10000-percent}]};
}
function snapshot(rule,amountSats=1000000n){
 return snapshotSyntheticAdminSplit({rule,orderId:"test-order-01",
 amountSats,testOnly:true,network:"regtest"});
}
test("admin-selected 90/10 and 85/15 both preserve exact frozen entitlements",()=>{
 const a=snapshot(fixture(9000,1));
 const b=snapshot(fixture(8500,2));
 assert.deepEqual(a.pending.map(x=>x.entitlementSats),[900000n,100000n]);
 assert.deepEqual(b.pending.map(x=>x.entitlementSats),[850000n,150000n]);
 assert.equal(a.rule.version,1);
 assert.equal(b.rule.version,2);
 assert.equal(a.amountSats,b.amountSats);
 assert.equal(a.feePolicy,"separate_merchant_reserve_test_only");
 assert.equal(a.prismForwardingVerified,false);
 assert.equal(a.productionReady,false);
 assert.equal(Object.isFrozen(a),true);
 assert.equal(Object.isFrozen(a.pending[0]),true);
 const original=b.pending[0].entitlementSats;
 fixture(9000,3);
 assert.equal(b.pending[0].entitlementSats,original);
});
test("largest-remainder rounding preserves every satoshi, deterministically",()=>{
 const rule={...fixture(9000,1),allocations:[
 {recipient_id:suppliers[0],basis_points:3333},
 {recipient_id:suppliers[1],basis_points:3333},
 {recipient_id:suppliers[2],basis_points:3334},
 ]};
 const a=snapshot(rule,10001n),b=snapshot(rule,10001n);
 assert.equal(a.pending.reduce((n,x)=>n+x.entitlementSats,0n),10001n);
 assert.deepEqual(a.pending,b.pending);
 assert.deepEqual(a.pending.map(x=>x.entitlementSats),[3333n,3333n,3335n]);
});
test("rejects draft and forged rules, unknown scopes, mainnet and totals != 100%",()=>{
 for(const rule of [
  {...fixture(),status:"draft"},
  {...fixture(),status:"active"},
  {...fixture(),status:"approved_test_fixture",version:0},
  {...fixture(),scope_type:"unknown"},
  {...fixture(),scope_id:"invalid"},
  {...fixture(),allocations:[{recipient_id:suppliers[0],basis_points:10000}]},
  {...fixture(),allocations:[
    {recipient_id:suppliers[0],basis_points:9001},
    {recipient_id:suppliers[1],basis_points:1000},
  ]},
  {...fixture(),allocations:[
    {recipient_id:suppliers[0],basis_points:9000},
    {recipient_id:suppliers[0],basis_points:1000},
  ]},
  {...fixture(),allocations:[
    {recipient_id:suppliers[0],basis_points:9000.5},
    {recipient_id:suppliers[1],basis_points:999.5},
  ]},
 ])assert.throws(()=>snapshot(rule));
 for(const config of [
  {testOnly:false,network:"regtest"},
  {testOnly:true,network:"mainnet"},
  {testOnly:true,network:"testnet"},
 ]){
   assert.throws(()=>snapshotSyntheticAdminSplit({rule:fixture(),orderId:"test-order-01",
     amountSats:1000000n,...config}));
 }
});
test("immutable rule version does not alter earlier order snapshots",()=>{
 const old=snapshot(fixture(9000,3),1001000n);
 const next=snapshot(fixture(8500,4),1001000n);
 assert.equal(old.rule.version,3);
 assert.equal(next.rule.version,4);
 assert.notDeepEqual(old.pending,next.pending);
 assert.equal(old.pending.reduce((n,x)=>n+x.entitlementSats,0n),1001000n);
 assert.equal(next.pending.reduce((n,x)=>n+x.entitlementSats,0n),1001000n);
});
