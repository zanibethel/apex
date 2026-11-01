/**
 * Non-executing payout entitlement snapshot used by disposable regtest tests.
 * 90/10 is a UI planning default, NOT hardcoded here.
 *
 * Deliberately does not install/configure Prism, sign Bitcoin transactions,
 * enable a payout worker, or turn admin draft rules into active rules.
 */
const id=/^[a-zA-Z0-9_-]{1,100}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function snapshotSyntheticAdminSplit({rule,orderId,amountSats,
  testOnly,network}={}) {
  if(testOnly!==true||network!=="regtest")throw Error("Only synthetic Bitcoin regtest allocations are permitted");
  if(!rule||rule.status!=="approved_test_fixture"||
    !["storefront","supplier","product"].includes(rule.scope_type)||
    typeof rule.scope_id!=="string"||!uuid.test(rule.scope_id)||
    typeof rule.version!=="number"||!Number.isSafeInteger(rule.version)||
    rule.version<1||!id.test(orderId)||
    typeof amountSats!=="bigint"||amountSats<1000n||
    amountSats>100000000n)throw Error("Invalid or unapproved synthetic payout rule");
  const allocations=rule.allocations;
  if(!Array.isArray(allocations)||allocations.length<2||allocations.length>100)
    throw Error("Invalid recipient count");
  const seen=new Set();let sum=0;
  const amounts=allocations.map((x,i)=>{
    if(!x||!uuid.test(x.recipient_id)||seen.has(x.recipient_id)||
      !Number.isInteger(x.basis_points)||x.basis_points<0||
      x.basis_points>10000)throw Error("Invalid or duplicate recipient allocation");
    seen.add(x.recipient_id);sum+=x.basis_points;
    const weighted=amountSats*BigInt(x.basis_points);
    return {
      index:i,recipientId:x.recipient_id,basisPoints:x.basis_points,
      sats:weighted/10000n,remainder:weighted%10000n,
    };
  });
  if(sum!==10000)throw Error("Payout allocation must total 100%");
  // Deterministic largest-remainder allocation; tie-break by input order.
  let remainder=amountSats-amounts.reduce((s,x)=>s+x.sats,0n);
  for(const x of [...amounts].sort((a,b)=>
      a.remainder===b.remainder?a.index-b.index:
      a.remainder>b.remainder?-1:1)){
    if(remainder<=0n)break;
    x.sats++;remainder--;
  }
  if(remainder!==0n)throw Error("Unexpected satoshi rounding remainder");
  // This is ENTITLEMENT, not the destination wallet's final net payout.
  return Object.freeze({
    testOnly:true,network:"regtest",orderId,
    rule:Object.freeze({version:rule.version,scopeType:rule.scope_type,
      scopeId:rule.scope_id}),
    amountSats,feePolicy:"separate_merchant_reserve_test_only",
    pending: Object.freeze(amounts.map(({recipientId,basisPoints,sats})=>
      Object.freeze({recipientId,basisPoints,entitlementSats:sats}))),
    }),
    prismForwardingVerified:false,productionReady:false,
  });
}
