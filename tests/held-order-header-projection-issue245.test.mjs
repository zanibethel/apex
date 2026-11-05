import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseSupplierHeldOrderHeaders} from "../src/lib/supplier/held-order-header-projection.mjs";
const store="62000000-0000-0000-0000-000000000001";
const other="62000000-0000-0000-0000-000000000002";
const uuid=i=>"66000245-0000-4000-8000-"+String(i).padStart(12,"0");
const row=(i,time)=>({
 order_id:uuid(i),store_id:store,original_reference:"SYNTH-HELD-"+i,
 purchased_at_utc:time,recorded_sale_state:"confirmed",
 stored_line_count:0,destination_sealed:false,
 status:"held_unverified",can_pay:false,can_ship:false,can_decrypt:false,
});
const sample=(rows=[row(2,"2026-11-04T20:00:00.000Z"),
 row(1,"2026-11-03T20:00:00.000Z")])=>({
 schema_version:1,store_id:store,source:"original_held_order_headers",
 limit:25,offset:0,total:rows.length,has_more:false,orders:rows,
 held_only:true,source_attested:false,
 payment_enabled:false,shipping_enabled:false,
 delivery_decryption_enabled:false,
});
test("authenticated held-only metadata is fixed, frozen and non-actionable",()=>{
 const parsed=parseSupplierHeldOrderHeaders(sample(),store);
 assert.ok(parsed);assert.equal(parsed.total,2);
 assert.equal(parsed.orders[0].id,uuid(2));
 assert.equal(parsed.orders[0].status,"held_unverified");
 assert.equal(parsed.orders[0].recordedSaleState,"confirmed");
 assert.equal(parsed.sourceAttested,false);
 assert.equal(parsed.canShip,false);
 assert.equal(parsed.canPay,false);
 assert.equal(Object.isFrozen(parsed),true);
 assert.equal(Object.isFrozen(parsed.orders[0]),true);
});
test("any forged payment, shipping, decrypted, external or customer field denies entire batch",()=>{
 for(const delta of [
  {held_only:false},{source_attested:true},{payment_enabled:true},
  {shipping_enabled:true},{delivery_decryption_enabled:true},
  {source:"paid_order"},{store_id:other},
  {delivery_address:"sensitive"},{schema_version:2},{total:3},
  {has_more:true},
 ]){
  assert.equal(parseSupplierHeldOrderHeaders({...sample(),...delta},store),null);
 }
 for(const delta of [
  {can_pay:true},{can_ship:true},{can_decrypt:true},
  {status:"ready_to_ship"},{title:"item"},
  {sku:"private"},{price_cents:"8000"},
  {recipient_email:"private"},{store_id:other},{stored_line_count:-1},
  {destination_sealed:"yes"},{order_id:"not-a-uuid"},
  {original_reference:" Name\nAddress"},
 ])assert.equal(parseSupplierHeldOrderHeaders(sample([
  {...row(2,"2026-11-04T20:00:00.000Z"),...delta},
 ]),store),null);
});
test("count, sorting, duplicate IDs and pagination must match canonical state",()=>{
 assert.equal(parseSupplierHeldOrderHeaders(sample([
  row(1,"2026-11-03T20:00:00.000Z"),
  row(2,"2026-11-04T20:00:00.000Z")]),store),null);
 assert.equal(parseSupplierHeldOrderHeaders(sample([
  row(1,"2026-11-04T20:00:00.000Z"),
  row(1,"2026-11-03T20:00:00.000Z")]),store),null);
 const a=sample([row(2,"2026-11-04T20:00:00.000Z")]);
 assert.ok(parseSupplierHeldOrderHeaders({...a,total:2,limit:1,has_more:true},store,{limit:1,offset:0}));
 assert.equal(parseSupplierHeldOrderHeaders({...a,total:2,limit:1,has_more:false},store,{limit:1,offset:0}),null);
 assert.equal(parseSupplierHeldOrderHeaders(a,other),null);
 assert.equal(parseSupplierHeldOrderHeaders(null,store),null);
 assert.equal(parseSupplierHeldOrderHeaders({...a,limit:26},store,{limit:26}),null);
 assert.equal(parseSupplierHeldOrderHeaders({...a,offset:-1},store,{offset:-1}),null);
});
test("SQL is read-only, membership gated, grants no raw table access",()=>{
 const sql=readFileSync("database/sql/apex_supplier_held_order_headers_PRODUCTION_REVIEW.sql","utf8");
 assert.match(sql,/security definer/);
 assert.match(sql,/set search_path=pg_catalog/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/join public\.supplier_memberships m/);
 assert.match(sql,/m\.user_id=v_uid/);
 assert.match(sql,/is_anonymous/);
 assert.match(sql,/private_release_gate/);
 assert.match(sql,/has_table_privilege\('authenticated'/);
 assert.match(sql,/grant execute on function[\s\S]*to authenticated/);
 assert.doesNotMatch(sql,/grant (insert|update|delete|select) on apex_internal/i);
 assert.doesNotMatch(sql,/purchaseLabel|sendEmail|createInvoice|wallet_address|pgp_sym_decrypt|convert_from\s*\(/i);
});
