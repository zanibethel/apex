import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseAdminPrivateCartValidation} from
 "../src/lib/checkout/admin-private-cart-validation.mjs";
const storeId="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const productId="64000000-0000-0000-0000-000000000001";
const checks={
 supplier_requested:false,admin_clear:true,identity_clear:true,
 content_review_clear:true,product_setup_complete:true,
 supplier_authorized:false,product_authorized:false,
 public_release_enabled:false,
};
const good={
 schema_version:1,state:"private_cart_observation",
 store_id:storeId,currency:"USD",total_units:2,
 observed_subtotal_cents:"10000",shipping_calculated:false,
 tax_calculated:false,can_quote:false,can_reserve_stock:false,
 can_create_order:false,can_create_invoice:false,can_pay:false,
 items:[{
  product_id:productId,quantity:2,name:"Catalog example",sku:"SKU01",
  currency:"USD",unit_price_cents:"5000",line_subtotal_cents:"10000",
  available_units:0,saved_price_valid:true,quantity_available:false,
  release_status_code:"insufficient_available_stock",
  release_checks:checks,can_order:false,can_pay:false,
 }],
};
const read=path=>readFileSync(path,"utf8");

test("strict parser verifies exact saved subtotals, quantity and fail-closed flags",()=>{
 const parsed=parseAdminPrivateCartValidation(good,storeId,productId,2);
 assert.ok(parsed);
 assert.equal(parsed.priceCents,5000);
 assert.equal(parsed.observedSubtotalCents,10000);
 assert.equal(parsed.stockSufficient,false);
 assert.equal(parsed.canOrder,false);
 assert.equal(parsed.canPay,false);
 assert.equal(parsed.checks.length,8);
 assert.ok(Object.isFrozen(parsed));
 assert.ok(Object.isFrozen(parsed.checks));
});
test("unknown, mismatched or transaction-enabled readbacks are rejected",()=>{
 const fails=[
  null,undefined,[],{}, {...good,store_id:"wrong"},
  {...good,items:[]},
  {...good,observed_subtotal_cents:"999"},
  {...good,can_quote:true},{...good,can_create_order:true},
  {...good,can_create_invoice:true},{...good,can_pay:true},
  {...good,shipping_calculated:true},{...good,tax_calculated:true},
  {...good,items:[{...good.items[0],can_pay:true}]},
  {...good,items:[{...good.items[0],quantity:3}]},
  {...good,items:[{...good.items[0],quantity_available:true}]},
  {...good,items:[{...good.items[0],unit_price_cents:"6000"}]},
  {...good,items:[{...good.items[0],release_checks:{...checks,product_authorized:null}}]},
  {...good,items:[{...good.items[0],name:""}]},
  {...good,items:[{...good.items[0],available_units:-1}]},
 ];
 for(const invalid of fails)
  assert.equal(parseAdminPrivateCartValidation(invalid,storeId,productId,2),null);
});
test("admin server action uses signed-in role and a hardcoded private store",()=>{
 const actions=read("src/app/admin/checkout-review/cart-validation-actions.ts");
 const component=read("src/app/admin/checkout-review/admin-cart-validation-form.tsx");
 const original=read("src/app/admin/checkout-review/checkout-catalog-review.tsx");
 const sql=read("supabase/migrations/20261103170000_apex_private_cart_validation.sql");
 const integration=read("tests/payout-rls/admin-private-cart-validation.sql");
 const workflow=read(".github/workflows/payout-rls.yml");
 assert.match(actions,/isVerifiedPlatformAdmin\(auth.user\)/);
 assert.match(actions,/auth.getUser\(\)/);
 assert.match(actions,/rpc\("get_admin_locked_cart_preflight"/);
 assert.match(actions,/p_expected_subtotal_cents:expectedSubtotalCents/);
 assert.match(actions,/p_store_id:STORE_ID/);
 assert.match(actions,/p_items:\[\{product_id:productId,quantity\}\]/);
 assert.doesNotMatch(actions,/\.insert\(|\.update\(|createInvoice|service_role|process\.env/);
 assert.match(component,/Validate saved price and stock/);
 assert.match(component,/No commercial quote or order is authorized/);
 assert.match(actions,/Checkout remains blocked/);
 assert.match(original,/AdminCartValidationForm key=\{product.id\+":"\+quantity\}/);
 assert.match(sql,/security definer/);
 assert.match(sql,/app_metadata,apex_role/);
 assert.match(sql,/get_private_release_readiness/);
 assert.match(sql,/unique|v_seen/);
 assert.match(sql,/available_units/);
 assert.match(sql,/v_product.price_cents\*v_qty/);
 assert.match(sql,/can_create_order',false/);
 assert.match(sql,/can_create_invoice',false/);
 assert.match(sql,/can_reserve_stock',false/);
 assert.match(sql,/revoke all on function public.get_admin_private_cart_validation/);
 assert.doesNotMatch(sql,/\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b|\bcreateInvoice\(|\bcreatePayout\(|\benabled\s*=\s*true\b/i);
 assert.match(integration,/Supplier spoofed admin validation/);
 assert.match(integration,/Untrusted cart input accepted/);
 assert.match(integration,/Live price\/stock readback not reflected/);
 assert.match(workflow,/admin-private-cart-validation\.sql/);
});
