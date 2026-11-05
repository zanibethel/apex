/**
 * Track 2: bounded, read-only relationship reconciliation for existing
 * RLS-protected admin reporting samples. This is NOT provider/chain settlement
 * verification. Reference gaps outside the sample are unknown, not missing.
 * No raw IDs or wallet/recipient information leave the result.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const UTC_TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/i;
const MAX_SATS=2100000000000000n;
const LABELS=Object.freeze({
 invalid_rule_reference:"Invalid sampled allocation-rule reference",
 invalid_snapshot_reference:"Invalid allocation snapshot identity or amounts",
 invalid_transfer_reference:"Invalid transfer-to-snapshot reference",
 rule_version_conflict:"Sampled snapshot uses a different version of its recorded allocation rule",
 snapshot_before_rule:"Snapshot observation predates its recorded allocation rule",
 transfer_before_snapshot:"Transfer observation predates its allocation snapshot",
 invalid_sample:"Sample cannot be reliably inspected",
});
const validId=value=>typeof value==="string"&&UUID.test(value);
const numericSats=value=>{
 if(typeof value==="number")
  return Number.isSafeInteger(value)&&value>=0?BigInt(value):null;
 if(typeof value==="string"&&/^(0|[1-9][0-9]{0,15})$/.test(value))
  return BigInt(value);
 return null;
};
const time=value=>
 typeof value==="string"&&UTC_TIME.test(value)&&Number.isFinite(Date.parse(value))
  ?Date.parse(value):null;

function inspectArray(rows,maxRows,reasons){
 if(!Array.isArray(rows)||rows.length>maxRows){
  reasons.add("invalid_sample");return null;
 }
 return rows;
}

/**
 * Cross-references ONLY the current three bounded readbacks.
 *
 * A transfer whose snapshot is absent from the latest 30 snapshots is NOT
 * evidence of a broken FK. Historical rows may simply be outside the page.
 * All findings require separate independent investigation.
 */
export function reconcileAdminPaymentReferencesV1({
 rules,transfers,snapshots,
}={}, {maxRows=30}={}){
 if(!Number.isSafeInteger(maxRows)||maxRows<1||maxRows>100)
  throw new RangeError("Invalid sample bound");
 const reasons=new Set();
 const r=inspectArray(rules,maxRows,reasons);
 const t=inspectArray(transfers,maxRows,reasons);
 const s=inspectArray(snapshots,maxRows,reasons);
 const limited=[r,t,s].some(rows=>rows?.length===maxRows);
 const counts={
  snapshotRuleMatches:0,snapshotRuleOutsideSample:0,
  transferSnapshotMatches:0,transferSnapshotOutsideSample:0,
 };
 const times=[];
 const ruleIndex=new Map();
 const snapshotIndex=new Map();
 if(r)for(const rule of r){
  const ts=time(rule?.created_at);
  if(!validId(rule?.id)||!Number.isSafeInteger(rule?.version)||
   rule.version<1||ts===null)reasons.add("invalid_rule_reference");
  else ruleIndex.set(rule.id.toLowerCase(),{version:rule.version,created:ts});
  if(ts!==null)times.push(ts);
 }
 if(s)for(const snap of s){
  const ts=time(snap?.created_at);
  const gross=numericSats(snap?.gross_sats);
  const distributable=numericSats(snap?.distributable_sats);
  if(!validId(snap?.id)||!validId(snap?.rule_id)||
   !Number.isSafeInteger(snap?.rule_version)||snap.rule_version<1||
   gross===null||gross>MAX_SATS||distributable===null||
   distributable>MAX_SATS||distributable>gross||ts===null){
   reasons.add("invalid_snapshot_reference");
  }else{
   snapshotIndex.set(snap.id.toLowerCase(),{created:ts});
   const rule=ruleIndex.get(snap.rule_id.toLowerCase());
   if(rule){
    counts.snapshotRuleMatches++;
    if(rule.version!==snap.rule_version)reasons.add("rule_version_conflict");
    if(ts<rule.created)reasons.add("snapshot_before_rule");
   }else counts.snapshotRuleOutsideSample++;
  }
  if(ts!==null)times.push(ts);
 }
 if(t)for(const transfer of t){
  const ts=time(transfer?.created_at);
  if(!validId(transfer?.id)||!validId(transfer?.snapshot_id)||ts===null){
   reasons.add("invalid_transfer_reference");
  }else{
   const snapshot=snapshotIndex.get(transfer.snapshot_id.toLowerCase());
   if(snapshot){
    counts.transferSnapshotMatches++;
    if(ts<snapshot.created)reasons.add("transfer_before_snapshot");
   }else counts.transferSnapshotOutsideSample++;
  }
  if(ts!==null)times.push(ts);
 }
 const available=!!(r&&t&&s);
 const conflicts=reasons.size>0;
 const outOfSample=counts.snapshotRuleOutsideSample+
  counts.transferSnapshotOutsideSample;
 const status=!available?"unavailable":conflicts?"review_required":
  limited||outOfSample>0?"bounded_reference_window":"sampled_references_consistent";
 return Object.freeze({
  status,
  counts:Object.freeze(counts),
  // These bounds are over the sample, NOT full event or audit-log history.
  observedWindow:Object.freeze({
   earliest:times.length?new Date(Math.min(...times)).toISOString():null,
   latest:times.length?new Date(Math.max(...times)).toISOString():null,
  }),
  reasonCodes:Object.freeze([...reasons].sort()),
  reasons:Object.freeze([...reasons].sort().map(code=>LABELS[code])),
  limitedSample:limited,
  completeHistory:false,
  providerEvidenceConnected:false,
  independentSettlementVerified:false,
  canReleaseCheckout:false,
  canCreateInvoice:false,
  canSendPayout:false,
 });
}
