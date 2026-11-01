import test from "node:test";
import assert from "node:assert/strict";
import {
  assessSyntheticPrismFeeBudget,
  btcAmountToSats,
  reconcileSyntheticPrismPayout,
} from "../src/lib/payments/prism-payout-reliability.mjs";

const ONE=1_000_000n;
const TEN=10_000_000n;
const feePolicy={testOnly:true,network:"regtest",recipientBasisPoints:[9000,1000],
 reserveBasisPoints:200,estimatedMaxNetworkFeeSats:15000n,
 feeSafetyMarginSats:15000n,minimumRecipientSats:50000n};
function budget(invoiceSats=TEN,other={}){
 return assessSyntheticPrismFeeBudget({...feePolicy,invoiceSats,...other});
}
const expected=[
 {role:"supplier",expectedSats:8820000n},
 {role:"platform",expectedSats:980000n},
];
function claim(role,state="Completed",amount){
 return {id:"synthetic-"+role,metadata:{Source:"Prism ("+role+")"},
  payoutMethodId:"BTC-CHAIN",payoutAmount:amount||
    (role==="supplier"?"0.08820000":"0.00980000"),state};
}
function reconcile({claims=[claim("supplier"),claim("platform")],
 receipts={supplier:{confirmedSats:8820000n,confirmations:1},
           platform:{confirmedSats:980000n,confirmations:1}},
 pendingAgeMinutes=0,expectedAmounts=expected,network="regtest"}={}){
 return reconcileSyntheticPrismPayout({
  testOnly:true,network,expected:expectedAmounts,claims,
  walletReceipts:receipts,pendingAgeMinutes,pendingAlertMinutes:15,
 });
}

test("fee gate matches documented synthetic small-invoice failure fixture",()=>{
 const small=budget(ONE);
 assert.equal(small.status,"hold_for_review");
 assert.ok(small.reasons.includes("INSUFFICIENT_FEE_HEADROOM"));
 assert.equal(small.reserveSats,20000n);
 assert.equal(small.requiredFeeReserveSats,30000n);
 assert.equal(small.allowsAutomaticPayout,false);
 assert.equal(small.productionReady,false);
 const large=budget(TEN);
 assert.equal(large.status,"test_budget_eligible");
 assert.equal(large.reserveSats,200000n);
 assert.deepEqual(large.expected.map(x=>x.expectedSats),[8820000n,980000n]);
 assert.equal(large.allowsAutomaticPayout,false);
});
test("no fixed 90/10: also accepts 85/15 with the same fee reserve",()=>{
 const large=budget(TEN,{recipientBasisPoints:[8500,1500]});
 assert.equal(large.status,"test_budget_eligible");
 assert.deepEqual(large.expected.map(x=>x.expectedSats),[8330000n,1470000n]);
 assert.equal(large.expected.reduce((x,y)=>x+y.expectedSats,0n),9800000n);
});
test("recipient dust threshold and missing fee ceiling always block",()=>{
 const caseA=budget(ONE,{recipientBasisPoints:[9500,500],minimumRecipientSats:100000n,
  estimatedMaxNetworkFeeSats:1000n,feeSafetyMarginSats:0n});
 assert.deepEqual(caseA.reasons,["RECIPIENT_BELOW_MINIMUM"]);
 assert.throws(()=>budget(TEN,{estimatedMaxNetworkFeeSats:0n}));
 for(const c of [
  {network:"mainnet"},{testOnly:false},{recipientBasisPoints:[10000,0]},
  {recipientBasisPoints:[8800,1500]},{reserveBasisPoints:0},
  {reserveBasisPoints:10000},{minimumRecipientSats:-1n},
  {estimatedMaxNetworkFeeSats:100.5},{invoiceSats:0n},
 ])assert.throws(()=>budget(TEN,c));
});
test("parse only exact integer satoshi amounts without float arithmetic",()=>{
 assert.equal(btcAmountToSats("0.08820000"),8820000n);
 assert.equal(btcAmountToSats("0.00980000"),980000n);
 assert.equal(btcAmountToSats("1.23456789"),123456789n);
 for(const x of ["1.123456789","-1","NaN","0.01e2","0x80"])
   assert.throws(()=>btcAmountToSats(x));
});
test("all Prism claims AND independently confirmed wallet receipts are required",()=>{
 const result=reconcile();
 assert.equal(result.status,"verified_complete");
 assert.equal(result.nextAction,"none");
 assert.equal(result.allowsOrderFulfillment,false);
 assert.equal(result.automaticRetryAllowed,false);
 assert.deepEqual(result.recipients.map(x=>x.status),["confirmed","confirmed"]);
});
test("regression: only supplier paid, platform AwaitingPayment requires review on timeout",()=>{
 const claims=[claim("supplier"),claim("platform","AwaitingPayment")];
 const receipts={supplier:{confirmedSats:8820000n,confirmations:3},
  platform:{confirmedSats:0n,confirmations:0}};
 const early=reconcile({claims,receipts,pendingAgeMinutes:2});
 assert.equal(early.status,"pending");
 assert.equal(early.nextAction,"poll_existing_payouts");
 assert.equal(early.automaticRetryAllowed,false);
 const late=reconcile({claims,receipts,pendingAgeMinutes:16});
 assert.equal(late.status,"manual_review");
 assert.equal(late.nextAction,"escalate_operator");
 assert.equal(late.recipients[1].reason,"PENDING_TIMEOUT_REQUIRES_INVESTIGATION");
});
test("misleading Completed status never replaces chain proof",()=>{
 const result=reconcile({receipts:{
  supplier:{confirmedSats:8820000n,confirmations:1},
  platform:{confirmedSats:0n,confirmations:0},
 }});
 assert.equal(result.status,"manual_review");
 assert.equal(result.recipients[1].reason,"MARKED_COMPLETE_WITHOUT_FULL_RECEIPT");
});
test("wrong amount, duplicate claims, cancelled, foreign method and overpayment escalate",()=>{
 for(const change of [
  {claims:[claim("supplier"),claim("supplier")]},
  {claims:[claim("supplier","Completed","0.08830000"),claim("platform")]},
  {claims:[claim("supplier"),claim("platform","Cancelled")]},
  {claims:[claim("supplier"),{...claim("platform"),payoutMethodId:"BTC-LN"}]},
  {receipts:{supplier:{confirmedSats:8820001n,confirmations:1},
     platform:{confirmedSats:980000n,confirmations:1}}},
  {claims:[claim("supplier"),claim("platform"),
    {...claim("platform"),id:"unrelated"}]},
 ]) {
  const result=reconcile(change);
  assert.equal(result.status,"manual_review");
  assert.equal(result.nextAction,"escalate_operator");
  assert.equal(result.automaticRetryAllowed,false);
 }
});
test("zero confirmations cannot be considered confirmed for payout reconciliation",()=>{
 const result=reconcile({receipts:{
   supplier:{confirmedSats:8820000n,confirmations:0},
   platform:{confirmedSats:980000n,confirmations:1},
 }});
 assert.notEqual(result.status,"verified_complete");
});
test("no production network or missing confirmation evidence accepted",()=>{
 assert.throws(()=>reconcile({network:"mainnet"}));
 assert.throws(()=>reconcile({receipts:null}));
 assert.throws(()=>reconcile({pendingAgeMinutes:-1}));
 assert.throws(()=>reconcile({expectedAmounts:[expected[0]]}));
});
