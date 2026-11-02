/**
 * TEST-ONLY Prism payout planning + passive reconciliation.
 * This module does not approve payout rules, sign transactions, retry/submit
 * payouts, issue credits, or interact with production BTCPay.
 *
 * Inputs are independently verified by the trusted caller. An observed Prism
 * claim is NOT proof that the recipient received confirmed Bitcoin.
 */
const roles=["supplier","platform"];
const receiptStates=new Set(["AwaitingApproval","AwaitingPayment",
  "InProgress","Completed","Cancelled"]);

function sats(value,field){
  if(typeof value!=="bigint"||value<0n||value>2100000000000000n)
    throw Error("Invalid "+field+" integer satoshis");
  return value;
}
function bps(value,field){
  if(!Number.isSafeInteger(value)||value<0||value>10000)
    throw Error("Invalid "+field+" basis points");
  return value;
}
function testGuard(input){
  if(input?.testOnly!==true||input.network!=="regtest")
    throw Error("Prism reliability policy is synthetic regtest only");
}
function inputBasisPoints(ratio){
  if(!Array.isArray(ratio)||ratio.length!==2||ratio.some(x=>
      !Number.isSafeInteger(x)||x<=0||x>=10000)||
      ratio[0]+ratio[1]!==10000)
    throw Error("Expected two distinct recipients totaling 10000 basis points");
  return ratio;
}
export function btcAmountToSats(value){
  const text=String(value);
  const match=/^(0|[1-9]\d{0,7})(?:\.(\d{1,8}))?$/.exec(text);
  if(!match)throw Error("Expected exact BTC decimal (8 places maximum)");
  return BigInt(match[1])*100000000n+
    BigInt((match[2]||"").padEnd(8,"0"));
}

/**
 * Explicit operator-supplied fees are conservative ceilings, NOT fees inferred
 * from a Prism quote, nor a guarantee. Return HOLD on unsafe assumptions.
 */
export function assessSyntheticPrismFeeBudget({
  testOnly,network,invoiceSats,recipientBasisPoints,reserveBasisPoints,
  estimatedMaxNetworkFeeSats,feeSafetyMarginSats,minimumRecipientSats,
}={}){
  testGuard({testOnly,network});
  sats(invoiceSats,"invoice");
  if(invoiceSats<1000n)throw Error("Synthetic invoice too small");
  const splits=inputBasisPoints(recipientBasisPoints);
  bps(reserveBasisPoints,"reserve");
  if(reserveBasisPoints<=0||reserveBasisPoints>=10000)
    throw Error("Expected nonzero reserved fee allocation");
  sats(estimatedMaxNetworkFeeSats,"estimated fee ceiling");
  sats(feeSafetyMarginSats,"fee safety margin");
  sats(minimumRecipientSats,"minimum recipient output");
  if(estimatedMaxNetworkFeeSats===0n)
    throw Error("Missing explicit nonzero fee ceiling");
  const reserve=(invoiceSats*BigInt(reserveBasisPoints))/10000n;
  const payoutPool=invoiceSats-reserve;
  const allocations=splits.map((portion,i)=>({
    role:roles[i],basisPoints:portion,
    expectedSats:payoutPool*BigInt(portion)/10000n,
  }));
  const reasons=[];
  if(reserve<estimatedMaxNetworkFeeSats+feeSafetyMarginSats)
    reasons.push("INSUFFICIENT_FEE_HEADROOM");
  if(allocations.some(x=>x.expectedSats<minimumRecipientSats))
    reasons.push("RECIPIENT_BELOW_MINIMUM");
  // This is a candidate policy gate. It cannot predict UTXO availability,
  // coin selection or fee spikes. Any later incomplete payout still BLOCKS.
  return Object.freeze({
    status:reasons.length?"hold_for_review":"test_budget_eligible",
    reasons:Object.freeze(reasons),
    invoiceSats,reserveSats:reserve,
    expected: Object.freeze(allocations.map(Object.freeze)),
    requiredFeeReserveSats:estimatedMaxNetworkFeeSats+feeSafetyMarginSats,
    allowsAutomaticPayout:false,productionReady:false,
  });
}

/**
 * Reconcile claims to *independently confirmed* receiver-wallet balances.
 * Never automatically resend a pending payout: it might already be broadcast.
 * Age is supplied explicitly by the caller, no hidden wall clock.
 */
export function reconcileSyntheticPrismPayout({
 testOnly,network,expected,claims,walletReceipts,pendingAgeMinutes=0,
 pendingAlertMinutes=15,
}={}){
 testGuard({testOnly,network});
 if(!Array.isArray(expected)||expected.length!==2||
    expected.some((x,i)=>x?.role!==roles[i]||
      typeof x.expectedSats!=="bigint"||x.expectedSats<=0n)||
    !Array.isArray(claims)||!walletReceipts||
    !Number.isFinite(pendingAgeMinutes)||pendingAgeMinutes<0||
    !Number.isFinite(pendingAlertMinutes)||pendingAlertMinutes<=0)
   throw Error("Invalid synthetic reconciliation snapshot");
 const matched=new Set();
 const results=roles.map((role,i)=>{
   const all=claims.filter(c=>c?.metadata?.Source==="Prism ("+role+")");
   if(all.length!==1) return {role,status:"manual_review",reason:"MISSING_OR_DUPLICATE_CLAIM"};
   const claim=all[0];
   if(!receiptStates.has(claim.state)||claim.payoutMethodId!=="BTC-CHAIN")
     return {role,status:"manual_review",reason:"UNSUPPORTED_CLAIM_STATE"};
   if(matched.has(claim.id)||typeof claim.id!=="string"||!claim.id)
     return {role,status:"manual_review",reason:"CONFLICTING_CLAIM_ID"};
   matched.add(claim.id);
   let claimed;
   try{claimed=btcAmountToSats(claim.payoutAmount);}
   catch{return {role,status:"manual_review",reason:"INVALID_CLAIM_AMOUNT"};}
   if(claimed!==expected[i].expectedSats)
     return {role,status:"manual_review",reason:"CLAIM_AMOUNT_MISMATCH"};
   const receipt=walletReceipts[role];
   if(!receipt||typeof receipt.confirmedSats!=="bigint"||
      receipt.confirmedSats<0n||
      !Number.isInteger(receipt.confirmations)||receipt.confirmations<0)
     return {role,status:"manual_review",reason:"MISSING_INDEPENDENT_WALLET_PROOF"};
   if(receipt.confirmedSats>expected[i].expectedSats)
     return {role,status:"manual_review",reason:"OVERPAYMENT"};
   if(claim.state==="Cancelled")
     return {role,status:"manual_review",reason:"CANCELLED"};
   if(claim.state==="Completed"&&receipt.confirmedSats===expected[i].expectedSats&&
     receipt.confirmations>=1)
     return {role,status:"confirmed",reason:"MATCHED_COMPLETED_AND_CHAIN"};
   if(claim.state==="Completed"&&receipt.confirmedSats!==expected[i].expectedSats)
     return {role,status:"manual_review",reason:"MARKED_COMPLETE_WITHOUT_FULL_RECEIPT"};
   if(receipt.confirmedSats>0n&&receipt.confirmedSats!==expected[i].expectedSats)
     return {role,status:"manual_review",reason:"PARTIAL_ON_CHAIN_RECEIPT"};
   if(pendingAgeMinutes>=pendingAlertMinutes)
     return {role,status:"manual_review",reason:"PENDING_TIMEOUT_REQUIRES_INVESTIGATION"};
   return {role,status:"pending",reason:"STATUS_POLL_ONLY_NO_RESEND"};
 });
 if(claims.length!==2){
   for(const result of results){
     if(result.status==="confirmed")continue;
     result.status="manual_review";
     result.reason="EXTRANEOUS_PAYOUT_CLAIM";
   }
 }
 const confirmed=results.every(x=>x.status==="confirmed");
 const review=results.some(x=>x.status==="manual_review");
 return Object.freeze({
   status:confirmed?"verified_complete":review?"manual_review":"pending",
   recipients:Object.freeze(results.map(Object.freeze)),
   nextAction:confirmed?"none":review?"escalate_operator":"poll_existing_payouts",
   automaticRetryAllowed:false,allowsOrderFulfillment:false,
   productionReady:false,
 });
}
