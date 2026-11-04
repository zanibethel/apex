import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseSalesReviewImport,serializeSalesReviewCsv,parseVerifiedReviewRows,HEADERS}
 from "../src/lib/supplier/sales-reconciliation-csv.mjs";
const store="62000000-0000-0000-0000-000000000001";
const purchase=(day)=>day+"T18:15:00.000000Z";
const sample=(ref,date,override={})=>({
 order_reference:ref,purchased_at_utc:purchase(date),
 sale_state:"confirmed",gross_cents:"3250",review_state:"unreviewed",
 review_note:"",version:0,...override,
});
const one=sample("APX-DAY3-001","2026-11-03");
const two=sample("APX-DAY4-001","2026-11-04");
test("unique permanent order reference + original UTC time survive download and upload",()=>{
 const csv=serializeSalesReviewCsv([one,two],store);
 const parsed=parseSalesReviewImport("\uFEFF"+csv,store);
 assert.equal(parsed.uniqueOrders,2);
 assert.equal(parsed.duplicatesInFile,0);
 assert.equal(parsed.rows[0].order_reference,one.order_reference);
 assert.equal(parsed.rows[0].purchased_at_utc,one.purchased_at_utc);
 assert.equal(parsed.rows[1].purchased_at_utc,two.purchased_at_utc);
 assert.deepEqual(HEADERS.slice(0,3),[
  "store_id","order_reference","purchased_at_utc",
 ]);
});
test("40-row cumulative workbook with 20 repeated earlier sales remains exactly 40 unique",()=>{
 const day3=Array.from({length:20},(_,i)=>sample("APX-D3-"+String(i+1).padStart(3,"0"),"2026-11-03"));
 const day4=Array.from({length:20},(_,i)=>sample("APX-D4-"+String(i+1).padStart(3,"0"),"2026-11-04"));
 const first=serializeSalesReviewCsv(day3,store);
 const full=serializeSalesReviewCsv([...day3,...day4],store);
 assert.equal(parseSalesReviewImport(first,store).uniqueOrders,20);
 assert.equal(parseSalesReviewImport(full,store).uniqueOrders,40);
 const duplicated=full+full.slice(full.indexOf("\r\n")+2);
 const parsed=parseSalesReviewImport(duplicated,store);
 assert.equal(parsed.uniqueOrders,40);
 assert.equal(parsed.duplicatesInFile,40);
});
test("modified duplicates in the same import are blocked instead of silently accepted",()=>{
 const csv=serializeSalesReviewCsv([one],store);
 const conflicting=serializeSalesReviewCsv([
  one,{...one,review_state:"reviewed"},
 ],store);
 assert.equal(parseSalesReviewImport(csv+csv.slice(csv.indexOf("\r\n")+2),store).duplicatesInFile,1);
 assert.throws(()=>parseSalesReviewImport(conflicting,store),/Conflicting duplicate/);
});
test("CSV rejects alien stores, invalid review, impossible structure and oversized files",()=>{
 assert.throws(()=>parseSalesReviewImport(serializeSalesReviewCsv([one],store),
  "00000000-0000-0000-0000-000000000003"),/another store/);
 const good=serializeSalesReviewCsv([one],store);
 for(const corrupted of [
  good.replace("unreviewed","shipped"),
  good.replace(one.order_reference,""),
  good.replace(one.purchased_at_utc,"2026-11-04T00:00:00.000Z"),
  good.replace("3250","-3250"),
  good.replace("0\r\n","99999999\r\n"),
  good.replace("store_id","customer_address"),
 ]){
  assert.throws(()=>parseSalesReviewImport(corrupted,store));
 }
 assert.throws(()=>parseSalesReviewImport("x".repeat(250001),store),/exceeds/);
});
test("escaped commas, spreadsheet formula prefixes and quotes are safe for roundtrip",()=>{
 const unsafe=sample("APX-C-001","2026-11-03",{
  review_note:'=HYPERLINK("https://example.invalid","hi"), next line\nnotes',
 });
 const csv=serializeSalesReviewCsv([unsafe],store);
 assert.match(csv,/'=HYPERLINK/);
 assert.match(csv,/""https:\/\/example.invalid""/);
 const result=parseSalesReviewImport(csv,store);
 assert.equal(result.rows[0].review_note,unsafe.review_note);
});
test("verified records are strictly server-sourced and cannot claim shipping details",()=>{
 const payload={
  schema_version:1,store_id:store,total:2,truncated:false,
  source:"verified_sales_history",shipping_data_available:false,
  rows:[one,two],
 };
 assert.equal(parseVerifiedReviewRows(payload,store)?.total,2);
 assert.equal(parseVerifiedReviewRows({...payload,rows:[one,one]},store),null);
 assert.equal(parseVerifiedReviewRows({...payload,shipping_data_available:true},store),null);
 assert.equal(parseVerifiedReviewRows({...payload,rows:[{...one,customer_address:"unknown"},two]},store),null);
});
test("supplier screen uses verified membership, server file validation, and no label purchase",()=>{
 const read=x=>readFileSync(x,"utf8");
 const page=read("src/app/supplier/reports/reconcile/page.tsx");
 const action=read("src/app/supplier/reports/reconcile/actions.ts");
 const workspace=read("src/app/supplier/reports/reconcile/workspace.tsx");
 const sql=read("supabase/migrations/20261104130000_apex_sales_review_reconciliation.sql");
 assert.match(page,/getSupplierWorkspace/);
 assert.match(page,/get_supplier_sales_reconciliation/);
 assert.match(action,/getSupplierWorkspace/);
 assert.match(action,/parseSalesReviewImport/);
 assert.match(action,/apply_supplier_sales_reconciliation/);
 assert.match(action,/w\.memberships/);
 assert.match(sql,/unique\(sale_id,new_version\)/);
 assert.match(sql,/for update/);
 assert.match(sql,/Stale review version/);
 assert.match(sql,/purchase timestamp mismatch/);
 assert.match(sql,/security definer/);
 assert.match(sql,/force row level security/);
 assert.match(sql,/duplicates_created',0/);
 assert.match(workspace,/Download CSV/);
 assert.match(workspace,/Upload revised review CSV/);
 assert.match(workspace,/Older purchase/);
 assert.doesNotMatch(action+workspace+sql,/purchaseLabel|usps\.com\/ship|createShipment|ship_to_address/i);
});
