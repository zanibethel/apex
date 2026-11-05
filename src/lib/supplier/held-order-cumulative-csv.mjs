/**
 * Apex #248 — original held-order metadata CSV only.
 * Records repeat across cumulative downloads by design; canonical order IDs
 * are stable deduplication keys. Never suppress duplicates within one export.
 * All input pages come from membership-checked RPC + strict schema parser.
 */
import {parseSupplierHeldOrderHeaders}
 from "./held-order-header-projection.mjs";

export const HELD_EXPORT_PAGE_SIZE=25;
export const HELD_EXPORT_MAX_ROWS=1025;
export const HELD_EXPORT_COLUMNS=Object.freeze([
 "report_schema","generated_at_utc","store_id","original_order_id",
 "original_order_reference","original_purchased_at_utc",
 "recorded_sale_state","stored_line_count_unverified",
 "sealed_destination_record_exists","record_status",
 "source_independently_attested","payment_authorized",
 "shipping_authorized","fulfillment_authorized",
]);

export class HeldExportError extends Error{
 constructor(code){super("Held-order CSV export unavailable");this.name="HeldExportError";
  this.code=code;}
}

function csvCell(value){
 let str=String(value);
 // Excel/Sheets formula injection: quoted CSV alone is NOT sufficient.
 if(/^[\s\u200b-\u200d\ufeff]*[=+\-@]/u.test(str))str="'"+str;
 return '"'+str.replaceAll('"','""')+'"';
}

function stableKey(order){
 return order.purchasedAt+":"+order.id.toLowerCase();
}

export async function createCumulativeHeldCsv({
 rpc,storeId,generatedAt,
}){
 if(typeof rpc!=="function"||typeof storeId!=="string"||
  !(generatedAt instanceof Date)||
  !Number.isFinite(generatedAt.getTime()))
  throw new HeldExportError("invalid_request");

 const generated=generatedAt.toISOString();
 const seen=new Set();
 const collected=[];
 let expectedTotal=null;
 let previous=null;
 let previousHasMore=false;
 const maxPages=Math.ceil(HELD_EXPORT_MAX_ROWS/HELD_EXPORT_PAGE_SIZE);

 for(let page=0;page<maxPages;page++){
  const offset=page*HELD_EXPORT_PAGE_SIZE;
  let response;
  try{
   response=await rpc("get_supplier_held_order_headers",{
    p_store_id:storeId,p_limit:HELD_EXPORT_PAGE_SIZE,p_offset:offset,
   });
  }catch{
   throw new HeldExportError("read_failed");
  }
  if(!response||response.error)
   throw new HeldExportError("read_failed");

  const parsed=parseSupplierHeldOrderHeaders(response.data,storeId,{
   limit:HELD_EXPORT_PAGE_SIZE,offset,
  });
  if(!parsed)throw new HeldExportError("invalid_source");

  if(expectedTotal===null){
   expectedTotal=parsed.total;
   if(expectedTotal>HELD_EXPORT_MAX_ROWS)
    throw new HeldExportError("over_limit");
  }else if(parsed.total!==expectedTotal)
   throw new HeldExportError("changed_during_read");

  const needed=Math.min(HELD_EXPORT_PAGE_SIZE,expectedTotal-offset);
  if(parsed.orders.length!==needed)
   throw new HeldExportError("partial_page");
  if(page>0&&!previousHasMore)
   throw new HeldExportError("unexpected_page");

  for(const order of parsed.orders){
   const id=order.id.toLowerCase();
   const cursor=stableKey(order);
   if(seen.has(id))throw new HeldExportError("duplicate_order_id");
   if(previous!==null&&cursor>=previous)
    throw new HeldExportError("out_of_order");
   seen.add(id);previous=cursor;collected.push(order);
  }

  previousHasMore=parsed.hasMore;
  if(!parsed.hasMore)break;
 }

 if(expectedTotal===null||collected.length!==expectedTotal||previousHasMore)
  throw new HeldExportError("incomplete_export");

 // Check the first page a second time after pagination to catch concurrent
 // inserts moving offset boundaries. No other data is ever written.
 if(expectedTotal>HELD_EXPORT_PAGE_SIZE){
  let first;
  try{
   first=await rpc("get_supplier_held_order_headers",{
    p_store_id:storeId,p_limit:HELD_EXPORT_PAGE_SIZE,p_offset:0,
   });
  }catch{throw new HeldExportError("read_failed");}
  if(!first||first.error)throw new HeldExportError("read_failed");
  const check=parseSupplierHeldOrderHeaders(first.data,storeId,{
   limit:HELD_EXPORT_PAGE_SIZE,offset:0,
  });
  if(!check||check.total!==expectedTotal||
   check.orders.length!==HELD_EXPORT_PAGE_SIZE||
   check.orders.some((item,i)=>item.id!==collected[i].id||
    item.purchasedAt!==collected[i].purchasedAt||
    item.reference!==collected[i].reference))
   throw new HeldExportError("changed_during_read");
 }

 const rows=[HELD_EXPORT_COLUMNS.map(csvCell).join(",")];
 for(const order of collected){
  rows.push([
   "held_metadata_v1",generated,storeId,order.id,order.reference,
   order.purchasedAt,order.recordedSaleState,order.storedLineCount,
   order.destinationSealed,"held_unverified",false,false,false,false,
  ].map(csvCell).join(","));
 }
 return Object.freeze({
  csv:"\ufeff"+rows.join("\r\n")+"\r\n",
  recordCount:collected.length,generatedAtUtc:generated,
  filename:"apex-held-order-review-"+storeId+"-"+generated.slice(0,10)+".csv",
 });
}
