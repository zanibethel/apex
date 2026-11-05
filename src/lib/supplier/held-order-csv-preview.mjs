/**
 * Issue #216: supplier-only, metadata-only CSV DRY RUN.
 * Current /api/supplier/held-order-export is the sole authoritative read.
 * Uploaded files are never posted, persisted, or treated as shipping evidence.
 */
import {HELD_EXPORT_COLUMNS,HELD_EXPORT_MAX_ROWS}
 from "./held-order-cumulative-csv.mjs";
import {parseCsvCells} from "./sales-reconciliation-csv.mjs";

const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const STATES=new Set(["pending","confirmed","refunded","cancelled"]);
const READONLY_COLUMNS=HELD_EXPORT_COLUMNS.filter(x=>x!=="generated_at_utc");

export class HeldPreviewError extends Error{
 constructor(code){super("Held-order review CSV cannot be verified ("+code+")");
  this.name="HeldPreviewError";this.code=code;}
}
const utc=s=>UTC.test(s)&&Number.isFinite(Date.parse(s))&&
 new Date(s).toISOString()===s;
const exactColumns=cells=>cells.length===HELD_EXPORT_COLUMNS.length;
const identity=row=>row.original_order_id.toLowerCase();
const unchanged=(a,b)=>READONLY_COLUMNS.every(key=>a[key]===b[key]);
const dateCentral=s=>{
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",
 }).formatToParts(new Date(s));
 const get=type=>parts.find(p=>p.type===type)?.value;
 return get("year")+"-"+get("month")+"-"+get("day");
};

export function parseHeldReviewCsv(csv,expectedStoreId){
 if(typeof expectedStoreId!=="string"||!UUID.test(expectedStoreId))
  throw new HeldPreviewError("store");
 let cells;
 try{cells=parseCsvCells(csv,{
  maxRows:HELD_EXPORT_MAX_ROWS+1,maxChars:800000,
 });}catch{throw new HeldPreviewError("syntax_or_size");}
 if(!cells.length||!exactColumns(cells[0])||
  cells[0].some((key,i)=>key!==HELD_EXPORT_COLUMNS[i]))
  throw new HeldPreviewError("schema");
 const records=new Map();
 let duplicates=0,reportTime=null;
 for(const rowCells of cells.slice(1)){
  if(!exactColumns(rowCells))throw new HeldPreviewError("columns");
  const row=Object.fromEntries(
   HELD_EXPORT_COLUMNS.map((key,i)=>[key,rowCells[i]]));
  if(row.report_schema!=="held_metadata_v1"||
   row.store_id!==expectedStoreId||
   !UUID.test(row.original_order_id)||
   row.original_order_id!==row.original_order_id.toLowerCase()||
   !utc(row.generated_at_utc)||!utc(row.original_purchased_at_utc)||
   row.original_purchased_at_utc>row.generated_at_utc||
   !row.original_order_reference||row.original_order_reference.length>220||
   /[\x00-\x1f\x7f]/.test(row.original_order_reference)||
   !STATES.has(row.recorded_sale_state)||
   !/^(0|[1-9]\d?)$/.test(row.stored_line_count_unverified)||
   Number(row.stored_line_count_unverified)>50||
   !["true","false"].includes(row.sealed_destination_record_exists)||
   row.record_status!=="held_unverified"||
   row.source_independently_attested!=="false"||
   row.payment_authorized!=="false"||
   row.shipping_authorized!=="false"||
   row.fulfillment_authorized!=="false")
   throw new HeldPreviewError("untrusted_row");
  if(reportTime!==null&&row.generated_at_utc!==reportTime)
   throw new HeldPreviewError("mixed_export_times");
  reportTime=row.generated_at_utc;
  const key=identity(row),prior=records.get(key);
  if(prior){
   if(!unchanged(prior,row))throw new HeldPreviewError("conflicting_duplicate");
   duplicates++;continue;
  }
  records.set(key,Object.freeze(row));
 }
 return Object.freeze({records,duplicates,reportTime});
}

export function previewHeldReviewCsvs(uploadedCsvs,currentCsv,storeId){
 if(!Array.isArray(uploadedCsvs)||uploadedCsvs.length<1||
  uploadedCsvs.length>4)
  throw new HeldPreviewError("file_count");
 const current=parseHeldReviewCsv(currentCsv,storeId);
 if(current.duplicates)throw new HeldPreviewError("duplicate_authoritative_source");
 const observed=new Map(),conflictingIds=new Set();
 let duplicateIdentical=0,uploadedRows=0;
 for(const csv of uploadedCsvs){
  const file=parseHeldReviewCsv(csv,storeId);
  uploadedRows+=file.records.size+file.duplicates;
  duplicateIdentical+=file.duplicates;
  for(const [id,row] of file.records){
   const previous=observed.get(id);
   if(previous){
    if(unchanged(previous,row))duplicateIdentical++;
    else conflictingIds.add(id);
   }else observed.set(id,row);
  }
 }
 let matching=0,staleOrChanged=0,unknown=0;
 for(const [id,row] of observed){
  const authoritative=current.records.get(id);
  if(!authoritative)unknown++;
  else if(!unchanged(authoritative,row))staleOrChanged++;
  else matching++;
 }
 const reportDate=current.reportTime?dateCentral(current.reportTime):null;
 let originalToday=0,priorOriginal=0;
 for(const row of current.records.values()){
  if(dateCentral(row.original_purchased_at_utc)===reportDate)originalToday++;
  else priorOriginal++;
 }
 return Object.freeze({
  uploadedRows,uniqueUploadedOrders:observed.size,duplicateIdentical,
  conflictingDuplicateIds:conflictingIds.size,
  currentUniqueOrders:current.records.size,matching,staleOrChanged,unknown,
  notInUploadedFiles:[...current.records.keys()]
   .filter(id=>!observed.has(id)).length,
  originalToday,priorOriginal,reportDate,
  reviewOnly:true,canImport:false,canShip:false,
  safe:conflictingIds.size===0&&staleOrChanged===0&&unknown===0,
 });
}
