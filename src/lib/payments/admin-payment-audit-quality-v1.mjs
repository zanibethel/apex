/**
 * Admin-only read-side quality assessment for an RLS-scoped payment monitor.
 * Checks at most a bounded sample already fetched by the page.
 * Recorded database fields are NOT blockchain, wallet, or provider evidence.
 * No network, database writes, action tokens, or permission decisions.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const RULE_STATES=new Set(["draft","scheduled","active","paused","archived"]);
const TRANSFER_STATES=new Set(["pending","submitted","confirmed","failed","reversed"]);
const SCOPE_TYPES=new Set(["storefront","supplier","product"]);
const MAX_SATS=2100000000000000n;

const LABELS=Object.freeze({
 rule_read_unavailable:"Allocation rule read unavailable",
 transfer_read_unavailable:"Transfer journal read unavailable",
 snapshot_read_unavailable:"Allocation snapshot read unavailable",
 invalid_sample:"Sample shape or size cannot be verified",
 rule_sample_limit:"Rule sample reached page limit; total coverage unknown",
 transfer_sample_limit:"Transfer sample reached page limit; total coverage unknown",
 snapshot_sample_limit:"Snapshot sample reached page limit; total coverage unknown",
 duplicate_rule_id:"Duplicate rule identity in sample",
 duplicate_transfer_id:"Duplicate transfer identity in sample",
 duplicate_snapshot_id:"Duplicate snapshot identity in sample",
 invalid_rule_record:"Invalid rule metadata",
 invalid_transfer_record:"Invalid transfer metadata or amount",
 invalid_snapshot_record:"Invalid allocation snapshot metadata",
 unrecognized_rule_state:"Unrecognized allocation rule state",
 unrecognized_transfer_state:"Unrecognized transfer state",
});

const add=(set,code)=>set.add(code);
const exactId=value=>typeof value==="string"&&UUID.test(value);
function timestamp(value){
 return typeof value==="string"&&value.length<=40&&
  /^\d{4}-\d{2}-\d{2}T/.test(value)&&
  Number.isFinite(Date.parse(value));
}
function safeSats(value){
 if(typeof value==="number")return Number.isSafeInteger(value)&&
  value>=0&&BigInt(value)<=MAX_SATS;
 if(typeof value==="string"&&/^(0|[1-9][0-9]{0,15})$/.test(value))
  return BigInt(value)<=MAX_SATS;
 return false;
}
function auditGroup(rows,kind,reasons,maxRows){
 if(!Array.isArray(rows)){
  add(reasons,kind+"_read_unavailable");
  return null;
 }
 if(rows.length>maxRows){
  add(reasons,"invalid_sample");return null;
 }
 if(rows.length===maxRows)add(reasons,kind+"_sample_limit");
 const ids=new Set();
 for(const row of rows){
  const id=row?.id;
  if(!exactId(id)){
   add(reasons,"invalid_"+kind+"_record");
  }else{
   if(ids.has(id.toLowerCase()))add(reasons,"duplicate_"+kind+"_id");
   ids.add(id.toLowerCase());
  }
  if(!timestamp(row?.created_at))
   add(reasons,"invalid_"+kind+"_record");
  if(kind==="rule"){
   if(!RULE_STATES.has(row?.status))add(reasons,"unrecognized_rule_state");
   if(!SCOPE_TYPES.has(row?.scope_type)||!exactId(row?.scope_id)||
    !Number.isSafeInteger(row?.version)||row.version<1)
    add(reasons,"invalid_rule_record");
  }else if(kind==="transfer"){
   if(!TRANSFER_STATES.has(row?.state))
    add(reasons,"unrecognized_transfer_state");
   if(!safeSats(row?.amount_sats))
    add(reasons,"invalid_transfer_record");
  }
 }
 return rows.length;
}

/**
 * No inferred full-database counts: the view reads only LIMIT recent rows.
 * The status describes sampled data quality, NOT clearance to transact.
 */
export function assessAdminPaymentAuditSample({
 rules,transfers,snapshots,
}={}, {maxRows=30}={}){
 if(!Number.isSafeInteger(maxRows)||maxRows<1||maxRows>100)
  throw new RangeError("Audit sample limit invalid");
 const reasons=new Set();
 const nRules=auditGroup(rules,"rule",reasons,maxRows);
 const nTransfers=auditGroup(transfers,"transfer",reasons,maxRows);
 const nSnapshots=auditGroup(snapshots,"snapshot",reasons,maxRows);
 const failures=[...reasons].filter(code=>
  !code.endsWith("_sample_limit")&&!code.endsWith("_read_unavailable"));
 const unavailable=[nRules,nTransfers,nSnapshots].some(n=>n===null);
 const limited=[...reasons].some(code=>code.endsWith("_sample_limit"));
 const status=unavailable?"unavailable":
  failures.length?"review_required":
  limited?"bounded_sample":"recorded_sample_only";
 const codes=Object.freeze([...reasons].sort());
 return Object.freeze({
  status,
  inspected:Object.freeze({rules:nRules,transfers:nTransfers,snapshots:nSnapshots}),
  reasons:Object.freeze(codes.map(code=>LABELS[code]??"Audit review required")),
  reasonCodes:codes,
  sourceCoverageVerified:false,
  providerSettlementVerified:false,
  canReleaseCheckout:false,
  canCreateInvoice:false,
  canApprovePayout:false,
 });
}
