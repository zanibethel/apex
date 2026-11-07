/**
 * Disposable Prism v1.3.3 three-wallet regtest verification only.
 * One BTCPay provider store with Apex 10%, Lily 45%, Tierra 45% initially.
 * No production credentials, destination wallet activation, or real payouts.
 */
import {buildApexSharedThreeWayDraftV1,
 snapshotApexSharedThreeWayRegtestV1} from "./apex-shared-three-way-split-v1.mjs";
import {btcAmountToSats} from "./prism-payout-reliability.mjs";

const ROLE_ORDER=Object.freeze(["apex","lily","tierra"]);
const SAT_LIMIT=100_000_000n;
const address=/^bcrt1[ac-hj-np-z02-9]{12,100}$/i;
const confirmedStates=new Set(["AwaitingApproval","AwaitingPayment","InProgress","Completed","Cancelled"]);

export function createThreeWayPrismRegtestSettings({
  storeId,recipientIds,addresses,version,lilyBasisPoints=4500,
  invoiceSats=10_000_000n,testOnly,network,
}={}) {
 if(testOnly!==true||network!=="regtest"||
    !Number.isSafeInteger(version)||version<1||
    typeof invoiceSats!=="bigint"||invoiceSats<100000n||
    invoiceSats>SAT_LIMIT||
    !addresses||!ROLE_ORDER.every(role=>typeof addresses[role]==="string"&&
      address.test(addresses[role]))||
    Object.keys(addresses).length!==3||
    new Set(Object.values(addresses)).size!==3)
  throw Error("Disposable three-recipient Prism regtest configuration denied");
 const rule=buildApexSharedThreeWayDraftV1({storeId,recipientIds,lilyBasisPoints});
 const entitlement=snapshotApexSharedThreeWayRegtestV1({
  draft:rule,version,orderReference:"prism-test-"+version,
  amountSats:invoiceSats,testOnly:true,network:"regtest",
 });
 // Two percent is a SYNTHETIC reserve, not measured network fees.
 const reserve=(invoiceSats*200n)/10000n;
 const distributable=invoiceSats-reserve;
 // Largest remainder cents/satoshi allocation, deterministic if a fractional
 // satoshi is owed: avoids orphan/missing satoshis, enforces exact pool total.
 const portions=rule.allocations.map((row,index)=>{
  const numerator=distributable*BigInt(row.basis_points);
  return {role:row.role,recipientId:row.recipient_id,
   basisPoints:row.basis_points,amountSats:numerator/10000n,
   remainder:numerator%10000n,index};
 });
 let leftover=distributable-portions.reduce((sum,p)=>sum+p.amountSats,0n);
 for(const p of [...portions].sort((a,b)=>
  a.remainder===b.remainder?a.index-b.index:
  a.remainder>b.remainder?-1:1)){
  if(leftover===0n)break;
  p.amountSats++;leftover--;
 }
 if(leftover!==0n||portions.some(p=>p.amountSats<50000n)||
   reserve<30000n)
  throw Error("Synthetic three-wallet fee headroom or minimum output denied");
 const expected=Object.freeze(portions.map(p=>Object.freeze({
  role:p.role,recipientId:p.recipientId,basisPoints:p.basisPoints,
  expectedSats:p.amountSats,
 })));
 const destinations=Object.fromEntries(ROLE_ORDER.map(role=>[role,{
  Destination:addresses[role],PayoutMethodId:"BTC-CHAIN",
 }]));
 const settings={
  Enabled:true,SatThreshold:100,Reserve:2,Version:0,
  DestinationBalance:{},PendingPayouts:{},Destinations:destinations,
  Splits:[{Source:"*CHAIN",Destinations:rule.allocations.map(x=>({
   Destination:x.role,Percentage:x.basis_points/100,
  }))}],
 };
 return Object.freeze({settings,expected,entitlement,
  reserveSats:reserve,distributableSats:distributable,
  productionReady:false,canPayout:false});
}

export function reconcileThreeWayPrismRegtest({
  expected,claims,walletReceipts,testOnly,network,pendingAgeMinutes=0,
  pendingAlertMinutes=15,
}={}) {
 if(testOnly!==true||network!=="regtest"||
    !Array.isArray(expected)||expected.length!==3||
    !Array.isArray(claims)||!walletReceipts||
    !Number.isFinite(pendingAgeMinutes)||pendingAgeMinutes<0||
    !Number.isFinite(pendingAlertMinutes)||pendingAlertMinutes<=0)
  throw Error("Synthetic three-way reconciliation unavailable");
 const validExpected=expected.every((e,i)=>e?.role===ROLE_ORDER[i]&&
  typeof e.expectedSats==="bigint"&&e.expectedSats>=50000n);
 if(!validExpected)throw Error("Expected synthetic payout amounts unavailable");
 const results=expected.map(e=>{
  const found=claims.filter(x=>x?.metadata?.Source==="Prism ("+e.role+")");
  if(found.length!==1)
   return {role:e.role,status:"manual_review",reason:"MISSING_OR_DUPLICATE_CLAIM"};
  const claim=found[0];
  if(!confirmedStates.has(claim.state)||claim.payoutMethodId!=="BTC-CHAIN"||
    typeof claim.id!=="string"||!claim.id.trim())
   return {role:e.role,status:"manual_review",reason:"INVALID_PAYOUT_CLAIM"};
  let amount;
  try{amount=btcAmountToSats(claim.payoutAmount);}
  catch{return {role:e.role,status:"manual_review",reason:"INVALID_PAYOUT_AMOUNT"};}
  if(amount!==e.expectedSats)
   return {role:e.role,status:"manual_review",reason:"PAYOUT_AMOUNT_MISMATCH"};
  const proof=walletReceipts[e.role];
  if(!proof||typeof proof.confirmedSats!=="bigint"||
    proof.confirmedSats<0n||
    !Number.isSafeInteger(proof.confirmations)||proof.confirmations<0)
   return {role:e.role,status:"manual_review",reason:"MISSING_RECEIVING_WALLET_PROOF"};
  if(proof.confirmedSats>e.expectedSats)
   return {role:e.role,status:"manual_review",reason:"OVERPAYMENT"};
  if(claim.state==="Cancelled")
   return {role:e.role,status:"manual_review",reason:"CANCELLED"};
  if(claim.state==="Completed"&&
     proof.confirmedSats===e.expectedSats&&proof.confirmations>=1)
   return {role:e.role,status:"confirmed",reason:"MATCHED_COMPLETED_ON_CHAIN"};
  if(claim.state==="Completed"&&
     (proof.confirmations<1||proof.confirmedSats!==e.expectedSats))
   return {role:e.role,status:"manual_review",reason:"UNCONFIRMED_OR_PARTIAL_PAYOUT"};
  if(proof.confirmedSats>0n&&proof.confirmedSats!==e.expectedSats)
   return {role:e.role,status:"manual_review",reason:"PARTIAL_PAYOUT"};
  if(pendingAgeMinutes>=pendingAlertMinutes)
   return {role:e.role,status:"manual_review",reason:"PENDING_OPERATOR_REVIEW"};
  return {role:e.role,status:"pending",reason:"POLL_ONLY"};
 });
 // Unknown or duplicate payouts are never reconciled away; do not mistakenly
 // count three matching payouts as full proof when a fourth transfer exists.
 const uniqueIds=new Set(claims.map(x=>x?.id));
 if(claims.length!==3||uniqueIds.size!==3){
  for(const r of results){r.status="manual_review";r.reason="UNACCOUNTED_PAYOUT_CLAIM";}
 }
 const completed=results.every(x=>x.status==="confirmed");
 const review=results.some(x=>x.status==="manual_review");
 return Object.freeze({
  status:completed?"verified_complete":review?"manual_review":"pending",
  recipients:Object.freeze(results.map(r=>Object.freeze(r))),
  nextAction:completed?"none":review?"escalate_operator":"poll_existing_payouts",
  automaticRetryAllowed:false,canReleaseCheckout:false,
  canShip:false,productionReady:false,
 });
}
