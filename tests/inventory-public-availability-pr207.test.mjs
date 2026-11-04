import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {privateInventoryState} from "../src/lib/catalog/private-inventory-state.mjs";
import {buildCartReview} from "../src/lib/cart/customer-cart.mjs";
const read=p=>readFileSync(p,"utf8");
const id="64000000-0000-0000-0000-000000000001";
const policy={
 charge_shipping:true,flat_shipping_cents:1500,medium_flat_shipping_cents:2580,
 free_shipping_min_subtotal_cents:20001,envelope_max_items:4,
};
const source=(availability,quantity=2)=>({
 schema_version:1,state:"rechecked_inventory_cart",requested_code:"",
 items:[{product_id:id,name:"Released catalog product",unit_price_cents:"1500",
 quantity,availability,can_checkout:false}],
 shipping:policy,promotion:null,can_place_order:false,can_create_invoice:false,
 can_reserve_stock:false,can_pay:false,
});
test("private inventory handles available, zero stock, held units and invalid records",()=>{
 assert.deepEqual(privateInventoryState({quantity_on_hand:6,quantity_reserved:2}),{
  kind:"available",label:"Stock: 4 available",availableUnits:4,canPublish:false,canOrder:false,
 });
 assert.equal(privateInventoryState({quantity_on_hand:3,quantity_reserved:3}).kind,"sold_out");
 assert.equal(privateInventoryState({quantity_on_hand:0,quantity_reserved:0}).availableUnits,0);
 for(const x of [
  null,undefined,{}, {quantity_on_hand:-1,quantity_reserved:0},
  {quantity_on_hand:1,quantity_reserved:2},
  {quantity_on_hand:2.5,quantity_reserved:0},
  {quantity_on_hand:3,quantity_reserved:-1},
 ]){
  assert.equal(privateInventoryState(x).kind,"unverified");
  assert.equal(privateInventoryState(x).canOrder,false);
 }
});
test("customer cart distinguishes observed in-stock and sold-out without order rights",()=>{
 const items=[{product_id:id,quantity:2}];
 const inStock=buildCartReview(source("in_stock"),{items,boxSize:"auto"});
 const sold=buildCartReview(source("sold_out"),{items,boxSize:"auto"});
 assert.equal(inStock.ok,true);
 assert.equal(inStock.status,"stock_observed");
 assert.equal(inStock.items[0].availability,"in_stock");
 assert.equal(sold.ok,true);
 assert.equal(sold.status,"unavailable_stock");
 assert.equal(sold.items[0].availability,"sold_out");
 for(const obj of [inStock,sold]){
  assert.equal(obj.canPay,false);
  assert.equal(obj.canPlaceOrder,false);
  assert.equal(obj.shippingCents,1500);
  assert.equal(obj.totalCents,4500);
 }
});
test("customer parser rejects unauthorized or invented availability and checkout",()=>{
 const items=[{product_id:id,quantity:2}];
 for(const invalid of [
  source("available"),source("unknown"),
  {...source("in_stock"),items:[{...source("in_stock").items[0],can_checkout:true}]},
  {...source("in_stock"),can_pay:true},
  {...source("in_stock"),can_create_invoice:true},
  {...source("in_stock"),state:"rechecked_sold_out_cart"},
  {...source("in_stock"),items:[{...source("in_stock").items[0],quantity:3}]},
 ]){
  assert.equal(buildCartReview(invalid,{items}).ok,false,JSON.stringify(invalid).slice(0,250));
 }
});
test("approved catalog remains gated and source never exposes stock counts",()=>{
 const sql=read("supabase/migrations/20261104103000_apex_inventory_aware_catalog.sql");
 const client=read("src/lib/supabase/approved-sold-out-catalog.ts");
 const shelf=read("src/app/catalog/approved-sold-out-shelf.tsx");
 assert.match(sql,/where singleton=true and enabled=true/);
 assert.match(sql,/sa.status='verified'/);
 assert.match(sql,/pa.status='verified'/);
 assert.match(sql,/sa.evidence_reference/);
 assert.match(sql,/pa.evidence_reference/);
 assert.match(sql,/c.supplier_wants_listing=true and c.admin_gate='clear'/);
 assert.match(sql,/c.republish_approval_required or c.republish_approved/);
 assert.match(sql,/i.quantity_reserved between 0 and i.quantity_on_hand/);
 assert.match(sql,/then 'in_stock' else 'sold_out'/);
 assert.match(sql,/and i.quantity_on_hand=0 and i.quantity_reserved=0/);
 assert.match(sql,/'can_checkout',false/);
 assert.match(sql,/revoke all on function public.get_public_inventory_catalog/);
 assert.match(sql,/v_available>=v_quantity then 'in_stock'/);
 assert.match(sql,/when v_available>0 then 'insufficient_stock'/);
 assert.doesNotMatch(sql,/update public\.products|update public\.stores|insert into apex_internal|can_pay',true/);
 assert.match(client,/get_public_inventory_catalog/);
 assert.match(client,/cache:"no-store"/);
 assert.match(client,/row.availability as "sold_out"\|"in_stock"/);
 assert.doesNotMatch(client,/service_role|\\.insert\\(|\\.update\\(/);
 assert.match(shelf,/p.availability==="in_stock"/);
 assert.match(shelf,/actionLabel="Add to cart"/);
 assert.match(shelf,/Checkout unavailable|checkout unavailable/);
});
test("authenticated supplier/admin stock and publishing actions invalidate catalog",()=>{
 const owner=read("src/app/supplier/catalog/bulk/page.tsx");
 const tiles=read("src/app/supplier/catalog/bulk-editor.tsx");
 const admin=read("src/app/admin/listing-controls/page.tsx");
 const privateStock=read("src/app/supplier/operations/actions.ts");
 const supplierList=read("src/app/supplier/catalog/listing-actions.ts");
 const adminHold=read("src/app/admin/listing-controls/actions.ts");
 const bulk=read("src/app/supplier/catalog/bulk-actions.ts");
 assert.match(owner,/privateInventoryState/);
 assert.match(tiles,/listingStatus\?\.stockLabel/);
 assert.match(admin,/privateInventoryState/);
 assert.match(admin,/AdminListingOverrideForm/);
 assert.match(admin,/stockByProduct/);
 for(const action of [privateStock,supplierList,adminHold,bulk]){
  assert.match(action,/revalidatePath\("\/catalog"\)/);
  assert.match(action,/revalidatePath\("\/cart"\)/);
 }
 assert.doesNotMatch(privateStock,/\\.update\\(\\{is_published:\s*true/);
 assert.doesNotMatch(adminHold,/\\.update\\(\\{is_published:\s*true/);
});
