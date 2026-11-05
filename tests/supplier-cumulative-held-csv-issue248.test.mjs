import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createCumulativeHeldCsv,HeldExportError,HELD_EXPORT_MAX_ROWS,
 HELD_EXPORT_PAGE_SIZE,HELD_EXPORT_COLUMNS}
 from "../src/lib/supplier/held-order-cumulative-csv.mjs";

const store="62000000-0000-0000-0000-000000000001";
const other="62000000-0000-0000-0000-000000000002";
const at=new Date("2026-11-05T05:20:30.000Z");
const id=i=>"66000248-0000-4000-8000-"+String(i).padStart(12,"0");
const rowsFor=(n)=>Array.from({length:n},(_,i)=>({
 order_id:id(i),store_id:store,
 original_reference:i===0?"=SUM(1,2)":"HELD-ORIGINAL-"+i,
 purchased_at_utc:new Date(Date.parse("2026-11-01T00:00:00.000Z")-i*60000).toISOString(),
 recorded_sale_state:i%2?"pending":"confirmed",
 stored_line_count:i%3,destination_sealed:i%2===0,
 status:"held_unverified",can_pay:false,can_ship:false,can_decrypt:false,
}));

function makeRpc(rows,{transform=({data})=>data}={}){
 const calls=[];
 const rpc=async(name,args)=>{
  assert.equal(name,"get_supplier_held_order_headers");
  calls.push(args);
  const batch=rows.slice(args.p_offset,args.p_offset+args.p_limit);
  const data={
   schema_version:1,store_id:store,source:"original_held_order_headers",
   total:rows.length,offset:args.p_offset,limit:args.p_limit,
   has_more:args.p_offset+batch.length<rows.length,
   orders:batch,held_only:true,source_attested:false,
   payment_enabled:false,shipping_enabled:false,
   delivery_decryption_enabled:false,
  };
  return {data:transform({data,calls,args}),error:null};
 };
 return {rpc,calls};
}

test("zero original held records produce header-only CSV with bounded metadata",async()=>{
 const {rpc,calls}=makeRpc([]);
 const report=await createCumulativeHeldCsv({rpc,storeId:store,generatedAt:at});
 assert.equal(report.recordCount,0);
 assert.equal(report.generatedAtUtc,at.toISOString());
 assert.equal(report.csv.charCodeAt(0),0xfeff);
 assert.equal(report.csv.split("\r\n").filter(Boolean).length,1);
 assert.ok(report.csv.includes('"original_order_id"'));
 assert.match(report.filename,/2026-11-05\.csv$/);
 assert.deepEqual(calls.map(x=>x.p_offset),[0]);
});

test("multi-page cumulative export includes every original ID once and a stable dedup key",async()=>{
 const rows=rowsFor(52);
 const {rpc,calls}=makeRpc(rows);
 const report=await createCumulativeHeldCsv({rpc,storeId:store,generatedAt:at});
 assert.equal(report.recordCount,52);
 assert.deepEqual(calls.map(x=>x.p_offset),[0,25,50,0]);
 assert.ok(calls.every(x=>x.p_store_id===store&&x.p_limit===25));
 assert.equal(report.csv.split("\r\n").filter(Boolean).length,53);
 assert.ok(report.csv.includes(id(0)));
 assert.ok(report.csv.includes(id(51)));
 assert.match(report.csv,/"'=SUM\(1,2\)"/);
 assert.ok(report.csv.includes('"held_unverified"'));
 assert.ok(report.csv.includes('"false","false","false","false"'));
 assert.ok(!report.csv.includes("customer_address"));
 assert.ok(!report.csv.includes("product_title"));
 const {rpc:rerun}=makeRpc(rows);
 const second=await createCumulativeHeldCsv({
  rpc:rerun,storeId:store,generatedAt:new Date("2026-11-06T00:00:00Z"),
 });
 assert.ok(second.csv.includes(id(0))&&second.csv.includes(id(51)));
 assert.notEqual(second.generatedAtUtc,report.generatedAtUtc);
});

test("duplicated original IDs across pages fail instead of silently double-counting",async()=>{
 const rows=rowsFor(27);
 rows[25]={...rows[25],order_id:rows[0].order_id};
 const {rpc}=makeRpc(rows);
 await assert.rejects(
  createCumulativeHeldCsv({rpc,storeId:store,generatedAt:at}),
  x=>x instanceof HeldExportError&&x.code==="duplicate_order_id",
 );
});

test("changed total, missing pages, and re-ordered snapshot pages fail closed",async()=>{
 const data=rowsFor(52);
 const cases=[
  ({data,calls})=>calls.length===2?{...data,total:53}:data,
  ({data,calls})=>calls.length===2?{
   ...data,orders:data.orders.slice(0,20),
   has_more:true,
  }:data,
  ({data,calls})=>calls.length===4?{
   ...data,orders:[{...data.orders[0],original_reference:"MUTATED"},...data.orders.slice(1)],
  }:data,
 ];
 for(const transform of cases){
  const {rpc}=makeRpc(data,{transform});
  await assert.rejects(
   createCumulativeHeldCsv({rpc,storeId:store,generatedAt:at}),
   HeldExportError,
  );
 }
});

test("bounded API refuses a partial report when original count exceeds the RPC cap",async()=>{
 assert.equal(HELD_EXPORT_PAGE_SIZE,25);
 assert.equal(HELD_EXPORT_MAX_ROWS,1025);
 const {rpc,calls}=makeRpc(rowsFor(1026));
 await assert.rejects(
  createCumulativeHeldCsv({rpc,storeId:store,generatedAt:at}),
  x=>x instanceof HeldExportError&&x.code==="over_limit",
 );
 assert.equal(calls.length,1);
});

test("invalid authorization scope and RPC failure never release partial CSV",async()=>{
 const rows=rowsFor(2);
 const {rpc:wrongStore}=makeRpc(rows);
 await assert.rejects(
  createCumulativeHeldCsv({rpc:wrongStore,storeId:other,generatedAt:at}),
  HeldExportError,
 );
 await assert.rejects(
  createCumulativeHeldCsv({
   rpc:async()=>({data:null,error:{message:"private"}}),
   storeId:store,generatedAt:at,
  }),x=>x instanceof HeldExportError&&x.code==="read_failed",
 );
 await assert.rejects(
  createCumulativeHeldCsv({
   rpc:async()=>{throw new Error("private");},
   storeId:store,generatedAt:at,
  }),HeldExportError,
 );
 await assert.rejects(
  createCumulativeHeldCsv({rpc:wrongStore,storeId:store,generatedAt:new Date(NaN)}),
  HeldExportError,
 );
});

test("CSV schema contains original identifiers and dates, but no fulfillment fields",()=>{
 assert.deepEqual(HELD_EXPORT_COLUMNS,[
  "report_schema","generated_at_utc","store_id","original_order_id",
  "original_order_reference","original_purchased_at_utc",
  "recorded_sale_state","stored_line_count_unverified",
  "sealed_destination_record_exists","record_status",
  "source_independently_attested","payment_authorized",
  "shipping_authorized","fulfillment_authorized",
 ]);
 const all=HELD_EXPORT_COLUMNS.join(",").toLowerCase();
 for(const secret of ["recipient","address","wallet","tracking","unit_price",
  "customer_email","shipping_label","shipment_status"]){
  assert.equal(all.includes(secret),false,secret);
 }
});

test("server route authenticates, validates exact store, and disables caching",()=>{
 const src=readFileSync("src/app/api/supplier/held-order-export/route.ts","utf8");
 const page=readFileSync("src/app/supplier/reports/cumulative-csv/page.tsx","utf8");
 const nav=readFileSync("src/app/supplier/reports/page.tsx","utf8");
 assert.match(src,/getSupplierWorkspace/);
 assert.match(src,/if\(!workspace\)return new Response/);
 assert.match(src,/workspace\.stores\.find\(/);
 assert.match(src,/selected\.length!==1/);
 assert.match(src,/url\.searchParams\.size!==1/);
 assert.match(src,/workspace\.client\.rpc\.bind\(workspace\.client\)/);
 assert.match(src,/private, no-store/);
 assert.match(src,/Content-Disposition/);
 assert.match(src,/Content-Type":"text\/csv/);
 assert.match(src,/Cumulative report unavailable; no partial file produced/);
 assert.match(src,/status:401/);
 assert.match(src,/status:404/);
 assert.match(page,/getSupplierWorkspace/);
 assert.match(page,/\/api\/supplier\/held-order-export\?store=/);
 assert.match(nav,/\/supplier\/reports\/cumulative-csv/);
 assert.doesNotMatch(src,/service_role|supabaseAdmin|from\("order_detail_snapshots"\)|insert\(|update\(|delete\(|sendEmail\(|purchaseLabel\(|markShipped\(/i);
 assert.doesNotMatch(page,/get_supplier_held_order_headers|service_role|supabaseAdmin/);
});
