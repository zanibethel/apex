import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 parseSupplierHeldOrderLines,
} from "../src/lib/supplier/held-order-line-review.mjs";
import {summarizeReviewAllocations}
 from "../src/lib/supplier/review-only-fulfillment-state.mjs";

const read=path=>readFileSync(path,"utf8");
const store="62000000-0000-0000-0000-000000000001";
const order="66000300-0000-4000-8000-000000000001";
const first={
 line_id:"67000300-0000-4000-8000-000000000001",
 line_number:1,sku_at_purchase:"SKU-A",
 title_at_purchase:"Synthetic ordinary product",
 variant_at_purchase:"medium",quantity:2,
 unit_price_cents:"5000",line_subtotal_cents:"10000",
 currency:"USD",status:"held_unverified",shipping_authorized:false,
};
const second={
 ...first,line_id:"67000300-0000-4000-8000-000000000002",
 line_number:2,sku_at_purchase:"SKU-B",title_at_purchase:"Another item",
 variant_at_purchase:"",quantity:1,
 unit_price_cents:"2500",line_subtotal_cents:"2500",
};
const payload={
 schema_version:1,source:"original_held_order_line_snapshots",
 store_id:store,order_id:order,line_count:2,lines:[first,second],
 held_only:true,product_eligibility_verified:false,payment_verified:false,
 shipping_enabled:false,delivery_decryption_enabled:false,
};
const sample=()=>({...payload,lines:payload.lines.map(l=>({...l}))});
test("verifies exact original purchased-line snapshot and cannot infer fulfillment",()=>{
 const parsed=parseSupplierHeldOrderLines(payload,store,order,2);
 assert.ok(parsed);
 assert.equal(parsed.lineCount,2);
 assert.equal(parsed.lines[0].quantity,2);
 assert.equal(parsed.lines[0].title,first.title_at_purchase);
 assert.equal(parsed.lines[0].variant,"medium");
 assert.equal(parsed.lines[0].unitPriceCents,5000);
 assert.equal(parsed.lines[0].subtotalCents,10000);
 assert.equal(parsed.lines[1].subtotalCents,2500);
 assert.equal(parsed.heldOnly,true);
 assert.equal(parsed.canPay,false);
 assert.equal(parsed.canShip,false);
 assert.equal(parsed.canPurchaseLabel,false);
 assert.equal(parsed.canUpdateTracking,false);
 assert.equal(parsed.canViewDelivery,false);
});

test("fails closed on tampering, cross-store, missing/duplicate or unverified lines",()=>{
 for(const update of [
  {store_id:"62000000-0000-0000-0000-000000000002"},
  {order_id:"66000300-0000-4000-8000-000000000002"},
  {line_count:3},{held_only:false},{shipping_enabled:true},
  {payment_verified:true},{product_eligibility_verified:true},
  {delivery_decryption_enabled:true},{buyer_address:"PRIVATE"},
 ]){
  assert.equal(parseSupplierHeldOrderLines({...payload,...update},store,order,2),null);
 }
 for(const malformed of [
  [{...first,shipping_authorized:true},second],
  [{...first,unit_price_cents:"5001"},second],
  [{...first,quantity:101},second],
  [{...first,line_number:2},second],
  [second,first],
  [{...first,currency:"EUR"},second],
  [{...first,title_at_purchase:"INVALID\nTITLE"},second],
  [{...first,unit_price_cents:"0005000"},second],
  [{...first,line_id:"not-a-uuid"},second],
  [first,{...second,line_id:first.line_id}],
  [{...first,customer_name:"PRIVATE"},second],
  [first],
 ]){
  const x=sample();x.lines=malformed;
  assert.equal(parseSupplierHeldOrderLines(x,store,order,2),null);
 }
 assert.equal(parseSupplierHeldOrderLines(payload,store,order,1),null);
 assert.equal(parseSupplierHeldOrderLines(payload,store,order,51),null);
 assert.equal(parseSupplierHeldOrderLines(null,store,order,2),null);
});

test("zero saved lines is explicitly empty, not an invented purchase",()=>{
 const x={...payload,line_count:0,lines:[]};
 const parsed=parseSupplierHeldOrderLines(x,store,order,0);
 assert.ok(parsed);
 assert.deepEqual(parsed.lines,[]);
});
test("partial quantity preview validates remaining units but never ships",()=>{
 const p=parseSupplierHeldOrderLines(payload,store,order,2);
 const preview=summarizeReviewAllocations(p.lines.map((line,i)=>({
  lineId:line.id,purchasedQuantity:line.quantity,
  plannedQuantity:0,newPlanQuantity:i===0?1:0,
 })));
 assert.ok(preview);
 assert.equal(preview.requestedUnits,1);
 assert.equal(preview.remainingUnplannedUnits,2);
 assert.equal(preview.partiallyPlanned,true);
 assert.equal(preview.canShip,false);
 assert.equal(preview.canReserveInventory,false);
 assert.equal(preview.plannedOnly,true);
 assert.equal(summarizeReviewAllocations([{
  lineId:p.lines[0].id,purchasedQuantity:2,
  plannedQuantity:0,newPlanQuantity:3,
 }]),null);
});

test("individual order page revalidates current membership and authorized record before line read",()=>{
 const page=read("src/app/supplier/orders/[orderId]/page.tsx");
 const planner=read("src/app/supplier/orders/[orderId]/held-order-line-review.tsx");
 assert.match(page,/getSupplierWorkspace\(\)/);
 assert.match(page,/workspace\.stores\.find\(s=>s\.id===storeId\)/);
 assert.match(page,/get_supplier_held_order_record/);
 assert.match(page,/store&&order\?await workspace\.client\.rpc/);
 assert.match(page,/get_supplier_held_order_lines/);
 assert.match(page,/parseSupplierHeldOrderLines\(lineResponse\.data,store\.id,order\.id,/);
 assert.match(page,/order\.storedLineCount/);
 assert.match(page,/lines\?<HeldOrderLineReview/);
 assert.match(page,/Original purchased lines cannot be verified/);
 assert.match(planner,/summarizeReviewAllocations/);
 assert.match(planner,/Preview only/);
 assert.match(planner,/No quantity changes have been saved/);
 assert.doesNotMatch(page+planner,/\bservice_role\b|\.insert\(|\.update\(|createInvoice|purchaseLabel|saveShipment|shipping_authorized:true|fulfillment_authorized:true/);
});
test("gated database function and disposable RLS tests require private store identity",()=>{
 const sql=read("supabase/migrations/20261106222500_apex_supplier_held_order_lines_review.sql");
 const ci=read(".github/workflows/payout-rls.yml");
 assert.match(sql,/create function public\.get_supplier_held_order_lines/);
 assert.match(sql,/stable security definer/);
 assert.match(sql,/m\.user_id=v_uid/);
 assert.match(sql,/apex_internal\.private_release_gate/);
 assert.match(sql,/v_order\.payment_authorized is distinct from false/);
 assert.match(sql,/v_order\.fulfillment_authorized is distinct from false/);
 assert.match(sql,/l\.product_eligibility is distinct from 'not_verified'/);
 assert.match(sql,/l\.shipping_authorized is distinct from false/);
 assert.match(sql,/revoke all on function public\.get_supplier_held_order_lines/);
 assert.match(sql,/grant execute on function public\.get_supplier_held_order_lines/);
 assert.match(sql,/'payment_verified',false/);
 assert.match(sql,/'shipping_enabled',false/);
 assert.doesNotMatch(sql,/createInvoice|purchaseLabel|shipping_authorized',true/);
 assert.match(ci,/supplier-held-order-lines-review\.sql/);
});
