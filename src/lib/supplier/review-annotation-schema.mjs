/**
 * Schema checks for synthetic supplier review annotations.
 * This module neither performs network calls nor authorizes any action.
 */
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const states=new Set(["unreviewed","reviewed","needs_attention"]);
const keys=["row_key","review_state","review_note","review_version"];
const exact=(v,ks)=>v&&typeof v==="object"&&!Array.isArray(v)&&
 Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k));
export function parseAnnotationSnapshot(input,storeId){
 if(!uuid.test(storeId??"")||
  !exact(input,["schema_version","store_id","source","records",
   "shipping_enabled","fulfillment_updated"])||
  input.schema_version!==1||input.store_id!==storeId||
  input.source!=="held_review_annotations"||
  input.shipping_enabled!==false||input.fulfillment_updated!==false||
  !Array.isArray(input.records)||input.records.length>1000)return null;
 const rows=[],seen=new Set();
 for(const r of input.records){
  if(!exact(r,keys)||typeof r.row_key!=="string"||
   r.row_key.length>160||seen.has(r.row_key)||
   !states.has(r.review_state)||
   typeof r.review_note!=="string"||r.review_note.length>240||
   /[\x00-\x1f\x7f@]/.test(r.review_note)||
   !Number.isInteger(r.review_version)||
   r.review_version<1||r.review_version>10000)return null;
  seen.add(r.row_key);
  rows.push(Object.freeze({
   key:r.row_key,state:r.review_state,
   note:r.review_note,version:r.review_version,
  }));
 }
 return Object.freeze({storeId,records:Object.freeze(rows)});
}
export function parseAnnotationReceipt(input,storeId,processed){
 if(!exact(input,["schema_version","store_id","status","processed",
 "updated","unchanged","already_recorded","order_created",
 "shipment_modified","payment_modified","shipping_modified"])||
 !uuid.test(storeId??"")||input.store_id!==storeId||
 input.schema_version!==1||
 !["applied","identical_import_replay"].includes(input.status)||
 !Number.isSafeInteger(processed)||processed<0||processed>500||
 input.processed!==processed||
 ![input.updated,input.unchanged,input.already_recorded].every(
  n=>Number.isSafeInteger(n)&&n>=0&&n<=processed)||
 input.updated+input.unchanged!==processed||
 input.already_recorded>input.unchanged||
 input.order_created!==false||input.shipment_modified!==false||
 input.payment_modified!==false||input.shipping_modified!==false)return null;
 return Object.freeze({status:input.status,updated:input.updated,
  unchanged:input.unchanged,processed,
  canChangeExternalState:false});
}

/** Overlay approved annotation values on immutable exported review rows. */
export function mergeAnnotationSnapshot(rows,storeId,snapshot){
 if(!Array.isArray(rows)||snapshot?.storeId!==storeId||
  !Array.isArray(snapshot.records))return null;
 const map=new Map(),used=new Set();
 for(const a of snapshot.records)map.set(a.key,a);
 const next=[];
 for(const row of rows){
  if(row?.store_id!==storeId||
   !["incomplete_order","order_line","shipment_plan"].includes(row.row_kind)||
   row.review_state!=="unreviewed"||row.review_note!==""||
   String(row.review_version)!=="0")return null;
  const key=row.row_kind==="order_line"?
   row.order_id+":line:"+row.line_number:
   row.row_kind==="shipment_plan"?
   row.order_id+":plan:"+row.shipment_id:
   row.order_id+":incomplete";
  const found=map.get(key);
  if(found){
   if(row.row_kind==="incomplete_order"||used.has(key))return null;
   used.add(key);
   next.push(Object.freeze({...row,review_state:found.state,
    review_note:found.note,review_version:String(found.version)}));
  }else next.push(Object.freeze({...row}));
 }
 if(used.size!==map.size)return null;
 return Object.freeze(next);
}
