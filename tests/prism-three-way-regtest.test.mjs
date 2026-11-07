import test from "node:test";
import assert from "node:assert/strict";
import {createThreeWayPrismRegtestSettings,reconcileThreeWayPrismRegtest}
 from "../src/lib/payments/prism-three-way-regtest.mjs";
const uuid=n=>"ab000000-0000-4000-8000-"+String(n).padStart(12,"0");
const ids={apex:uuid(2),lily:uuid(3),tierra:uuid(4)};
const addresses={apex:"bcrt1q"+"q".repeat(38),
 lily:"bcrt1q"+"p".repeat(38),tierra:"bcrt1q"+"z".repeat(38)};
const base={storeId:uuid(1),recipientIds:ids,addresses,version:3,
 invoiceSats:10_000_000n,testOnly:true,network:"regtest"};
const config=(changes={})=>createThreeWayPrismRegtestSettings({...base,...changes});
const btc=sats=>(sats/100000000n)+"."+(sats%100000000n).toString().padStart(8,"0");
function paidFixture(){
 const {expected}=config();
 return {expected,
  claims:expected.map((e,i)=>({
   id:"claim-"+i,payoutMethodId:"BTC-CHAIN",state:"Completed",
   metadata:{Source:"Prism ("+e.role+")"},
   payoutAmount:btc(e.expectedSats),
  })),
  walletReceipts:Object.fromEntries(expected.map(x=>[x.role,{
   confirmedSats:x.expectedSats,confirmations:2,
  }])),testOnly:true,network:"regtest"};
}

test("one BTCPay fixture store holds three distinct wallet destinations and exact 10/45/45",()=>{
 const r=config();
 assert.equal(r.settings.Enabled,true);
 assert.equal(r.settings.Reserve,2);
 assert.equal(r.settings.Splits.length,1);
 assert.deepEqual(r.settings.Splits[0].Destinations.map(x=>x.Percentage),[10,45,45]);
 assert.deepEqual(Object.keys(r.settings.Destinations),["apex","lily","tierra"]);
 assert.deepEqual(r.expected.map(x=>x.expectedSats),[980000n,4410000n,4410000n]);
 assert.equal(r.expected.reduce((a,b)=>a+b.expectedSats,0n)+r.reserveSats,10000000n);
 assert.equal(r.entitlement.ruleVersion,3);
 assert.equal(r.productionReady,false);
 assert.equal(r.canPayout,false);
});

test("admin rule can rebalance suppliers while platform remains at 10%",()=>{
 const a=config({lilyBasisPoints:3000,version:4});
 assert.deepEqual(a.settings.Splits[0].Destinations.map(x=>x.Percentage),[10,30,60]);
 assert.deepEqual(a.expected.map(x=>x.expectedSats),[980000n,2940000n,5880000n]);
 assert.equal(a.entitlement.ruleVersion,4);
 assert.deepEqual(config().expected.map(x=>x.expectedSats),[980000n,4410000n,4410000n]);
});

test("satoshi rounding is complete and all percentages exact",()=>{
 const a=config({lilyBasisPoints:3555,invoiceSats:1234567n});
 assert.equal(a.expected.reduce((sum,x)=>sum+x.expectedSats,0n),a.distributableSats);
 assert.equal(a.expected.reduce((sum,x)=>sum+x.basisPoints,0),10000);
});

test("no mainnet, bad wallets, fake duplicate destinations or invalid rule inputs",()=>{
 for(const changes of [{network:"mainnet"},{network:"testnet"},{testOnly:false},
  {addresses:{...addresses,lily:addresses.apex}},
  {addresses:{...addresses,apex:"bc1q"+"q".repeat(38)}},
  {addresses:{apex:addresses.apex,lily:addresses.lily}},
  {lilyBasisPoints:9000},{lilyBasisPoints:0},
  {version:0},{invoiceSats:999n},{invoiceSats:100000001n}])
  assert.throws(()=>config(changes));
});

test("three plugin claims + three independent confirmed wallet receipts reconcile",()=>{
 const a=paidFixture();
 const result=reconcileThreeWayPrismRegtest(a);
 assert.equal(result.status,"verified_complete");
 assert.equal(result.recipients.length,3);
 assert.equal(result.recipients.every(x=>x.status==="confirmed"),true);
 assert.equal(result.automaticRetryAllowed,false);
 assert.equal(result.productionReady,false);
 assert.equal(result.canReleaseCheckout,false);
 assert.equal(result.canShip,false);
});

test("missing, duplicate, fourth, spoofed or mismatched Prism claims fail closed",()=>{
 const mutations=[
  d=>d.claims.pop(),
  d=>d.claims.push({...d.claims[0],id:"fourth"}),
  d=>d.claims[1]={...d.claims[1],id:d.claims[0].id},
  d=>d.claims[0].metadata.Source="Prism (unknown)",
  d=>d.claims[1].payoutAmount="0.00000100",
  d=>d.claims[1].payoutMethodId="BTC-LN",
 ];
 for(const mutate of mutations){
  const f=paidFixture();mutate(f);
  const result=reconcileThreeWayPrismRegtest(f);
  assert.equal(result.status,"manual_review");
  assert.equal(result.automaticRetryAllowed,false);
 }
});

test("no proof, zero confirmations, partial payment, cancellation or timeout grants completion",()=>{
 const mutations=[
  d=>{delete d.walletReceipts.tierra;},
  d=>{d.walletReceipts.apex.confirmations=0;},
  d=>{d.walletReceipts.lily.confirmedSats-=1n;},
  d=>{d.claims[2].state="Cancelled";},
  d=>{d.claims[2].state="AwaitingPayment";d.pendingAgeMinutes=15;},
 ];
 for(const mutate of mutations){
  const f=paidFixture();mutate(f);
  const r=reconcileThreeWayPrismRegtest(f);
  assert.equal(r.status,"manual_review");
 }
 const f=paidFixture();f.claims[1].state="InProgress";f.walletReceipts.lily.confirmedSats=0n;
 assert.equal(reconcileThreeWayPrismRegtest(f).status,"pending");
});
