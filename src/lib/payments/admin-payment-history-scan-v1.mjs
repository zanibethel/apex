/**
 * Track 2: read-only, bounded historical payment reporting scan.
 *
 * Input pages must come from an independently verified platform admin's
 * existing RLS-scoped session client. No provider calls, payment actions or
 * privileged database clients live in this module.
 *
 * A successful bounded scan verifies the accessible reporting row set and a
 * repeated first page, NOT an immutable database snapshot, blockchain history,
 * provider completeness, wallet finality or checkout readiness.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SATS_MAX=2100000000000000n;
const KINDS=["rules","snapshots","transfers"];
const MAX_ALLOWED=5000;
const reject=(code,counts={rules:null,snapshots:null,transfers:null})=>
 Object.freeze({
  status:"unavailable",reasonCodes:Object.freeze([code]),
  inspected:Object.freeze({...counts}),observations:null,
  recordsCovered:false,pointInTimeSnapshotVerified:false,
  independentSettlementVerified:false,canReleaseCheckout:false,
  canCreateInvoice:false,canSendPayout:false,
 });
const validId=s=>typeof s==="string"&&UUID.test(s);
const timestamp=s=>{
 if(typeof s!=="string"||s.length>45||
  !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s))return null;
 const n=Date.parse(s);
 return Number.isFinite(n)?n:null;
};
const sats=n=>{
 if(typeof n==="number")return Number.isSafeInteger(n)&&n>=0
  ?BigInt(n):null;
 if(typeof n==="string"&&/^(0|[1-9][0-9]{0,15})$/.test(n))
  return BigInt(n);
 return null;
};
function validEnvelope(row){
 return row!==null&&typeof row==="object"&&!Array.isArray(row)&&
  validId(row.id)&&timestamp(row.created_at)!==null;
}
function hasDescendingOrder(left,right){
 const a=timestamp(left.created_at),b=timestamp(right.created_at);
 if(a===null||b===null)return false;
 if(a>b)return true;
 if(a<b)return false;
 // Same millisecond: PostgreSQL timestamps can preserve microseconds.
 // Only require ID tie-break if the raw timestamp is exactly the same.
 return left.created_at!==right.created_at||
  left.id.toLowerCase()>right.id.toLowerCase();
}
function identicalRows(a,b){
 return a.length===b.length&&a.every((v,i)=>
  JSON.stringify(v)===JSON.stringify(b[i]));
}
async function collectKind(kind,readPage,asOf,pageSize,maxRows){
 let expected=null;
 const rows=[],seen=new Set();
 let firstPage=null;
 for(let offset=0;offset<=maxRows;offset+=pageSize){
  let response;
  try{response=await readPage({kind,offset,limit:pageSize,asOf});}
  catch{return {error:"report_read_failed"};}
  if(!response||response.error||!Array.isArray(response.data)||
   !Number.isSafeInteger(response.count)||response.count<0)
   return {error:"report_read_failed"};
  const {data,count}=response;
  if(count>maxRows)return {error:"history_limit_exceeded"};
  if(expected===null)expected=count;
  if(count!==expected)return {error:"history_changed_during_read"};
  const needed=Math.min(pageSize,expected-offset);
  if(data.length!==Math.max(0,needed))
   return {error:"history_page_incomplete"};
  if(firstPage===null)firstPage=data;
  for(const row of data){
   if(!validEnvelope(row))return {error:"invalid_history_row"};
   const key=row.id.toLowerCase();
   if(seen.has(key))return {error:"history_duplicate_identity"};
   if(rows.length&&!hasDescendingOrder(rows.at(-1),row))
    return {error:"history_order_changed"};
   rows.push(row);seen.add(key);
  }
  if(rows.length===expected)break;
 }
 if(expected===null||rows.length!==expected)
  return {error:"history_page_incomplete"};
 let check;
 try{check=await readPage({kind,offset:0,limit:pageSize,asOf});}
 catch{return {error:"report_read_failed"};}
 if(!check||check.error||check.count!==expected||
  !Array.isArray(check.data)||!identicalRows(firstPage,check.data))
  return {error:"history_changed_during_read"};
 return {rows,count:expected};
}

/**
 * Complete every accessible page only up to a strict per-source bound.
 * On any partial/error read, emit NO partial aggregate or raw details.
 *
 * readPage({kind,offset,limit,asOf}) -> {data,count,error}
 */
export async function scanAdminPaymentHistoryV1({
 readPage,asOf,pageSize=250,maxRows=MAX_ALLOWED,
}={}){
 if(typeof readPage!=="function"||
  typeof asOf!=="string"||!/^\d{4}-\d{2}-\d{2}T/.test(asOf)||
  !Number.isFinite(Date.parse(asOf))||
  !Number.isSafeInteger(pageSize)||pageSize<1||pageSize>500||
  !Number.isSafeInteger(maxRows)||maxRows<1||maxRows>MAX_ALLOWED||
  maxRows%pageSize!==0)
  throw new TypeError("Invalid protected history scan options");
 const history={};
 const counts={rules:null,snapshots:null,transfers:null};
 for(const kind of KINDS){
  const got=await collectKind(kind,readPage,asOf,pageSize,maxRows);
  if(got.error)return reject(got.error);
  history[kind]=got.rows;
  counts[kind]=got.count;
 }
 const reasonCodes=new Set();
 const observations={
  ruleVersionConflicts:0,
  snapshotBeforeRule:0,
  transferBeforeSnapshot:0,
  invalidRuleRows:0,
  invalidSnapshotRows:0,
  invalidTransferRows:0,
  unresolvedRuleReferences:0,
  unresolvedSnapshotReferences:0,
  transferAmountMismatches:0,
 };
 const rules=new Map(),snapshots=new Map();
 for(const r of history.rules){
  const valid=Number.isSafeInteger(r.version)&&r.version>0&&
   validId(r.scope_id)&&["storefront","supplier","product"].includes(r.scope_type);
  if(!valid){observations.invalidRuleRows++;continue;}
  rules.set(r.id.toLowerCase(),r);
 }
 for(const s of history.snapshots){
  const gross=sats(s.gross_sats),net=sats(s.distributable_sats);
  if(!validId(s.rule_id)||!Number.isSafeInteger(s.rule_version)||
   s.rule_version<1||gross===null||gross>SATS_MAX||
   net===null||net>SATS_MAX||net>gross){
   observations.invalidSnapshotRows++;continue;
  }
  snapshots.set(s.id.toLowerCase(),s);
  const source=rules.get(s.rule_id.toLowerCase());
  if(!source){observations.unresolvedRuleReferences++;continue;}
  if(source.version!==s.rule_version)observations.ruleVersionConflicts++;
  if(timestamp(s.created_at)<timestamp(source.created_at))
   observations.snapshotBeforeRule++;
 }
 for(const t of history.transfers){
  const amount=sats(t.amount_sats);
  if(!validId(t.snapshot_id)||amount===null||amount>SATS_MAX||
   !["pending","submitted","confirmed","failed","reversed"].includes(t.state)){
   observations.invalidTransferRows++;continue;
  }
  const s=snapshots.get(t.snapshot_id.toLowerCase());
  if(!s){observations.unresolvedSnapshotReferences++;continue;}
  if(timestamp(t.created_at)<timestamp(s.created_at))
   observations.transferBeforeSnapshot++;
  // A transfer amount cannot exceed the whole distributable allocation.
  // A recipient-specific match needs the allocation entry (not in this view).
  if(amount>sats(s.distributable_sats))
   observations.transferAmountMismatches++;
 }
 const anomalies=Object.values(observations).some(n=>n>0);
 if(anomalies)reasonCodes.add("recorded_relationship_review_required");
 const range=[...KINDS.flatMap(k=>history[k].map(x=>timestamp(x.created_at)))];
 const window=Object.freeze({
  earliest:range.length?new Date(Math.min(...range)).toISOString():null,
  latest:range.length?new Date(Math.max(...range)).toISOString():null,
 });
 return Object.freeze({
  status:anomalies?"review_required":"bounded_history_read_complete",
  reasonCodes:Object.freeze([...reasonCodes]),
  inspected:Object.freeze(counts),
  observations:Object.freeze(observations),
  observedWindow:window,asOf,
  recordsCovered:true,
  pointInTimeSnapshotVerified:false,
  independentSettlementVerified:false,
  canReleaseCheckout:false,canCreateInvoice:false,canSendPayout:false,
 });
}
