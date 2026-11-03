import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseAdminLockedCartPreflight} from
 "../src/lib/checkout/admin-private-cart-validation.mjs";
const read=(p)=>readFileSync(p,"utf8");
const store="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const product="64000000-0000-0000-0000-000000000001";
const checks=Object.fromEntries([
 "supplier_requested","admin_clear","identity_clear",
 "content_review_clear","product_setup_complete",
 "supplier_authorized","product_authorized","public_release_enabled",
].map(k=>[k,false]));
const data={
 schema_version:2,state:"locked_private_preflight",store_id:store,
 currency:"USD",total_units:2,observed_subtotal_cents:"10000",
 expected_subtotal_cents:"10000",subtotal_matches_display:true,
 lock_mode:"for_share_nowait",locks_persist_after_response:false,
 admission:"blocked",shipping_calculated:false,tax_calculated:false,
 can_quote:false,can_reserve_stock:false,can_create_order:false,
 can_create_invoice:false,can_pay:false,
 items:[{
  product_id:product,quantity:2,name:"Private catalog item",
  sku:"APEX-SKU-01",currency:"USD",
  unit_price_cents:"5000",line_subtotal_cents:"10000",
  available_units:0,saved_price_valid:true,quantity_available:false,
  release_status_code:"insufficient_available_stock",
  release_checks:checks,can_order:false,can_pay:false,
 }],
};
test("locked preflight parses only blocked and short-lived results",()=>{
 const verified=parseAdminLockedCartPreflight(data,store,product,2,10000);
 assert.ok(verified);
 assert.equal(verified.subtotalMatchesDisplay,true);
 assert.equal(verified.observedSubtotalCents,10000);
 assert.equal(verified.locksPersistAfterResponse,false);
 assert.equal(verified.canOrder,false);
 assert.equal(verified.canPay,false);
 assert.ok(Object.isFrozen(verified));
 const stale=parseAdminLockedCartPreflight({
  ...data,expected_subtotal_cents:"9000",subtotal_matches_display:false,
 },store,product,2,9000);
 assert.ok(stale);
 assert.equal(stale.subtotalMatchesDisplay,false);
 for(const invalid of [
  null,[],{}, {...data,state:"allowed"},{...data,admission:"ready"},
  {...data,can_pay:true},{...data,can_create_order:true},
  {...data,can_create_invoice:true},{...data,can_reserve_stock:true},
  {...data,locks_persist_after_response:true},
  {...data,lock_mode:"none"},
  {...data,subtotal_matches_display:false},
  {...data,expected_subtotal_cents:"9999"},
  {...data,observed_subtotal_cents:"9000"},
 ])assert.equal(parseAdminLockedCartPreflight(invalid,store,product,2,10000),null);
});
test("private locked preflight is scoped and strictly nontransactional",()=>{
 const sql=read("supabase/migrations/20261103190000_apex_admin_locked_cart_preflight.sql");
 const tests=read("tests/payout-rls/admin-locked-cart-preflight.sql");
 const race=read("tests/payout-rls/admin-locked-cart-concurrency.sh");
 const action=read("src/app/admin/checkout-review/cart-validation-actions.ts");
 const ui=read("src/app/admin/checkout-review/admin-cart-validation-form.tsx");
 const catalog=read("src/app/admin/checkout-review/checkout-catalog-review.tsx");
 const workflow=read(".github/workflows/payout-rls.yml");
 assert.match(sql,/volatile security definer/);
 assert.match(sql,/app_metadata,apex_role/);
 assert.match(sql,/get_admin_private_cart_validation\(p_store_id,p_items\)/);
 assert.match(sql,/for share nowait/g);
 assert.match(sql,/order by \(item.value->>'product_id'\)::uuid/);
 assert.match(sql,/v_subtotal=p_expected_subtotal_cents/);
 assert.match(sql,/'can_create_order',false/);
 assert.match(sql,/'can_create_invoice',false/);
 assert.match(sql,/'can_reserve_stock',false/);
 assert.match(sql,/revoke all on function public.get_admin_locked_cart_preflight/);
 assert.doesNotMatch(sql,/\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b|\bcreateInvoice\(/i);
 assert.match(tests,/Supplier forged admin role/);
 assert.match(tests,/Changed browser total was trusted/);
 assert.match(tests,/Stale shown price not invalidated/);
 assert.match(race,/inventory_items/);
 assert.match(race,/could not obtain lock on row/);
 assert.match(action,/auth.getUser\(\)/);
 assert.match(action,/isVerifiedPlatformAdmin\(auth.user\)/);
 assert.match(action,/rpc\("get_admin_locked_cart_preflight"/);
 assert.match(action,/p_expected_subtotal_cents:expectedSubtotalCents/);
 assert.doesNotMatch(action,/\.insert\(|\.update\(|createInvoice\(|process\.env/);
 assert.match(ui,/name="expectedSubtotalCents"/);
 assert.match(ui,/Locks expire|Locks expire|Locks end|Locks|locks expire|Locks/); 
 assert.match(catalog,/expectedSubtotalCents=\{subtotal\}/);
 assert.match(workflow,/admin-locked-cart-preflight\.sql/);
 assert.match(workflow,/admin-locked-cart-concurrency\.sh/);
});
