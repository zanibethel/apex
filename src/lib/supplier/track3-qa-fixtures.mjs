/**
 * Track 3 synthetic acceptance fixtures. Server-side only.
 * No records, recipients or secrets are loaded from production.
 */
import {parseCsvCells} from "./sales-reconciliation-csv.mjs";
import {
 buildCumulativeReviewWorkbook,serializeCumulativeReviewCsv,
 previewCumulativeReviewImport,
} from "./cumulative-fulfillment-review-csv.mjs";
import {
 createSupplierReviewEmailPreview,renderSupplierReviewEmailPreview,
} from "./review-email-report-manifest.mjs";

export const TRACK3_QA_STORE="62000000-0000-0000-0000-000000000001";
export const TRACK3_QA_DAY3="2026-11-03";
export const TRACK3_QA_DAY4="2026-11-04";
const uuid=(prefix,i)=>prefix+"-0000-4000-8000-"+String(i).padStart(12,"0");

function order(i,{day=3,revision=1}={}){
 const planned=2;
 return {
  id:uuid("66000319",i),storeId:TRACK3_QA_STORE,
  reference:"QA-ORDER-"+i,
  purchasedAt:new Date(Date.UTC(2026,10,day,20,0,i)).toISOString(),
  readiness:"held",purchasedUnits:3,plannedUnits:planned,
  unplannedUnits:1,
  lines:[{number:1,sku:"QA-SKU-"+i,title:"QA Item "+i,
   variant:"",purchased:3,planned,unplanned:1}],
  plans:[{
   id:uuid("71000319",i),reference:"QA-PLAN-"+i,
   revision,status:"review_only",plannedUnits:planned,
   drafts:revision>1?[{
    carrier:"USPS",
    reference:"9400000000000000"+String(i).padStart(4,"0"),
    revision:2,recordedAt:"2026-11-04T15:00:00.000Z",
   }]:[],canShip:false,canBuyLabel:false,
  }],
  canShip:false,canBuyLabel:false,canEnterTracking:false,
 };
}
function pages(items){
 const sorted=[...items].sort((a,b)=>b.purchasedAt.localeCompare(a.purchasedAt)
  ||b.id.localeCompare(a.id));
 return Array.from({length:Math.ceil(sorted.length/10)},(_,i)=>({
  storeId:TRACK3_QA_STORE,total:sorted.length,limit:10,offset:i*10,
  hasMore:(i+1)*10<sorted.length,
  orders:sorted.slice(i*10,(i+1)*10),
 }));
}
const cell=s=>/["\r\n,]/.test(s)?
 '"'+s.replaceAll('"','""')+'"':s;
function edit(csv,filter,note){
 const rows=parseCsvCells(csv,{maxRows:1002,maxChars:750000});
 if(!rows||!rows.length)throw Error("Invalid QA CSV");
 const header=rows[0];
 const kind=header.indexOf("row_kind"),ref=header.indexOf("order_reference");
 const state=header.indexOf("review_state"),comment=header.indexOf("review_note");
 if([kind,ref,state,comment].some(n=>n<0))throw Error("Missing QA columns");
 for(const r of rows.slice(1)){
  if(r[kind]==="shipment_plan"&&filter(r[ref])){
   r[state]="needs_attention";r[comment]=note;
  }
 }
 return rows.map(r=>r.map(cell).join(",")).join("\r\n")+"\r\n";
}
export function createTrack3QaFixtures(){
 const first20=Array.from({length:20},(_,i)=>order(i+1));
 const carried=Array.from({length:20},(_,i)=>order(i+1,{
  revision:i<10?2:1,
 }));
 const new20=Array.from({length:20},(_,i)=>order(i+21,{day:4}));
 const previous=buildCumulativeReviewWorkbook(
  pages(first20),TRACK3_QA_STORE,TRACK3_QA_DAY3);
 const current=buildCumulativeReviewWorkbook(
  pages([...carried,...new20]),TRACK3_QA_STORE,TRACK3_QA_DAY4);
 const previousCsv=serializeCumulativeReviewCsv(previous.rows,TRACK3_QA_STORE);
 const currentCsv=serializeCumulativeReviewCsv(current.rows,TRACK3_QA_STORE);
 const firstTen=ref=>/^QA-ORDER-(?:[1-9]|10)$/.test(ref);
 const staleCsv=edit(previousCsv,firstTen,"Older offline note");
 const freshCsv=edit(currentCsv,firstTen,"Latest review note");
 const stalePreview=previewCumulativeReviewImport(staleCsv,
  current.rows,TRACK3_QA_STORE);
 const freshPreview=previewCumulativeReviewImport(freshCsv,
  current.rows,TRACK3_QA_STORE);
 const email=createSupplierReviewEmailPreview(current,
  TRACK3_QA_STORE,TRACK3_QA_DAY4);
 if(current.totalOrders!==40||current.summary.newToday!==20||
  current.summary.carriedForward!==20||
  stalePreview.status!=="rejected"||stalePreview.staleRows!==10||
  freshPreview.status!=="preview_only"||freshPreview.changedRows!==10)
  throw Error("Synthetic fulfillment fixture failed integrity check");
 return {
  storeId:TRACK3_QA_STORE,
  day3:TRACK3_QA_DAY3,day4:TRACK3_QA_DAY4,
  totalOrders:current.totalOrders,day3Orders:previous.totalOrders,
  newToday:current.summary.newToday,
  carriedForward:current.summary.carriedForward,
  previousCsv,currentCsv,staleCsv,freshCsv,
  currentRows:current.rows,
  manifest:email.manifest,
  emailPreview:renderSupplierReviewEmailPreview(email.manifest),
 };
}
