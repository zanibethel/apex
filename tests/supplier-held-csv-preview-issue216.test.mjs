import test from "node:test";
import assert from "node:assert/strict";
import {createCumulativeHeldCsv,HELD_EXPORT_COLUMNS}
 from "../src/lib/supplier/held-order-cumulative-csv.mjs";
import {parseHeldReviewCsv,previewHeldReviewCsvs,HeldPreviewError}
 from "../src/lib/supplier/held-order-csv-preview.mjs";

const store="62000000-0000-0000-0000-000000000001";
const other="62000000-0000-0000-0000-000000000002";
const id=i=>"66000248-0000-4000-8000-"+String(i).padStart(12,"0");
const when=i=>new Date(Date.parse(i<20?
 "2026-11-03T15:00:00.000Z":"2026-11-04T15:00:00.000Z")+
 (i%20)*1000).toISOString();
const order=i=>({
 order_id:id(i),store_id:store,
 original_reference:"HELD-"+i,purchased_at_utc:when(i),
 recorded_sale_state:"pending",stored_line_count:1,
 destination_sealed:false,status:"held_unverified",
 can_pay:false,can_ship:false,can_decrypt:false,
});
function rpcFor(orderNumbers){
 const rows=orderNumbers.map(order).sort((a,b)=>
  b.purchased_at_utc.localeCompare(a.purchased_at_utc)||
  b.order_id.localeCompare(a.order_id));
 return async(name,args)=>{
  assert.equal(name,"get_supplier_held_order_headers");
  const page=rows.slice(args.p_offset,args.p_offset+args.p_limit);
  return {data:{
   schema_version:1,store_id:store,source:"original_held_order_headers",
   limit:args.p_limit,offset:args.p_offset,total:rows.length,
   has_more:args.p_offset+page.length<rows.length,orders:page,
   held_only:true,source_attested:false,
   payment_enabled:false,shipping_enabled:false,
   delivery_decryption_enabled:false,
  },error:null};
 };
}
async function exportAt(numbers,at){
 return (await createCumulativeHeldCsv({
  rpc:rpcFor(numbers),storeId:store,generatedAt:new Date(at),
 })).csv;
}
const day3=Array.from({length:20},(_,i)=>i);
const day4=Array.from({length:40},(_,i)=>i);
const d3="2026-11-03T18:00:00.000Z";
const d4="2026-11-04T18:00:00.000Z";

test("Day 3 has 20, Day 4 adds 20: exactly 40 original orders; repeated 20 are not created",async()=>{
 const old=await exportAt(day3,d3);
 const current=await exportAt(day4,d4);
 const result=previewHeldReviewCsvs([old,current],current,store);
 assert.equal(result.uploadedRows,60);
 assert.equal(result.uniqueUploadedOrders,40);
 assert.equal(result.currentUniqueOrders,40);
 assert.equal(result.duplicateIdentical,20);
 assert.equal(result.matching,40);
 assert.equal(result.notInUploadedFiles,0);
 assert.equal(result.staleOrChanged,0);
 assert.equal(result.conflictingDuplicateIds,0);
 assert.equal(result.unknown,0);
 assert.equal(result.originalToday,20);
 assert.equal(result.priorOriginal,20);
 assert.equal(result.reportDate,"2026-11-04");
 assert.equal(result.safe,true);
 assert.equal(result.canImport,false);
 assert.equal(result.canShip,false);
});

test("older workbook keeps 20 original records and identifies 20 added to current source",async()=>{
 const previous=await exportAt(day3,d3);
 const today=await exportAt(day4,d4);
 const result=previewHeldReviewCsvs([previous],today,store);
 assert.equal(result.uniqueUploadedOrders,20);
 assert.equal(result.notInUploadedFiles,20);
 assert.equal(result.matching,20);
});

test("10 edited historical identities conflict; not interpreted as shipment updates",async()=>{
 const previous=await exportAt(day3,d3);
 const current=await exportAt(day4,d4);
 let edited=previous;
 for(let i=0;i<10;i++)
  edited=edited.replace('"HELD-'+i+'"','"CHANGED-'+i+'"');
 const solo=previewHeldReviewCsvs([edited],current,store);
 assert.equal(solo.staleOrChanged,10);
 assert.equal(solo.safe,false);
 const overlap=previewHeldReviewCsvs([previous,edited,current],current,store);
 assert.equal(overlap.conflictingDuplicateIds,10);
 assert.equal(overlap.currentUniqueOrders,40);
 assert.equal(overlap.safe,false);
});

test("same files on repeated upload are no-ops and create no shipment authority",async()=>{
 const current=await exportAt(day4,d4);
 const result=previewHeldReviewCsvs([current,current,current],current,store);
 assert.equal(result.uniqueUploadedOrders,40);
 assert.equal(result.duplicateIdentical,80);
 assert.equal(result.matching,40);
 assert.equal(result.canImport,false);
 assert.equal(result.reviewOnly,true);
});

test("cross-store, forged shipping approval, extra fields and broken quoting fail closed",async()=>{
 const current=await exportAt(day3,d3);
 const cases=[
  current.replaceAll('"'+store+'"','"'+other+'"'),
  current.replace('"false","false","false","false"','"false","false","true","false"'),
  current.replace('"original_order_id"','"tracking_number"'),
  current.replace('"HELD-0"','"HELD-"0"'),
 ];
 for(const file of cases)
  assert.throws(()=>previewHeldReviewCsvs([file],current,store),
   HeldPreviewError);
 assert.throws(()=>previewHeldReviewCsvs([current],current,other),
  HeldPreviewError);
});

test("one file cannot silently carry two versions of one original order",async()=>{
 const current=await exportAt(day3,d3);
 const lines=current.trimEnd().split("\r\n");
 const same=lines.concat(lines[1]).join("\r\n")+"\r\n";
 const parsed=parseHeldReviewCsv(same,store);
 assert.equal(parsed.records.size,20);
 assert.equal(parsed.duplicates,1);
 const changed=lines.concat(lines[1].replace('"HELD-19"','"ALTERED-19"'))
  .join("\r\n")+"\r\n";
 assert.throws(()=>parseHeldReviewCsv(changed,store),
  x=>x instanceof HeldPreviewError&&x.code==="conflicting_duplicate");
});

test("strict current schema is immutable metadata only with no private delivery columns",async()=>{
 const empty=await exportAt([],d4);
 const parsed=parseHeldReviewCsv(empty,store);
 assert.equal(parsed.records.size,0);
 assert.deepEqual(HELD_EXPORT_COLUMNS.slice(0,4),[
  "report_schema","generated_at_utc","store_id","original_order_id"]);
 const columns=HELD_EXPORT_COLUMNS.join(",").toLowerCase();
 for(const word of ["email","address","recipient","tracking","shipment","label","customer"])
  assert.equal(columns.includes(word),false,word);

});
