import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 normalizeDiscountEntry,normalizeCartSelections,changeCartItem,
 buildCartReview,
} from "../src/lib/cart/customer-cart.mjs";
const read=path=>readFileSync(path,"utf8");
const product="64000000-0000-4000-8000-000000000001";

test("manual promo codes are normalized only when applied, and invalid entries are rejected",()=>{
 assert.equal(normalizeDiscountEntry(""),"");
 assert.equal(normalizeDiscountEntry("   "),"");
 assert.equal(normalizeDiscountEntry(" save10 "),"SAVE10");
 assert.equal(normalizeDiscountEntry("ship_free"),"SHIP_FREE");
 assert.equal(normalizeDiscountEntry("a-b"),"A-B");
 assert.equal(normalizeDiscountEntry("A".repeat(24)),"A".repeat(24));
 for(const invalid of ["x","AB","S P A C E","BAD!CODE","A".repeat(25),5,null])
  assert.equal(normalizeDiscountEntry(invalid),null,String(invalid));
});

test("cart icon opens a keyboard-accessible mini cart, not a direct full-page link",()=>{
 const header=read("src/app/layout.tsx");
 const cart=read("src/app/cart/cart-provider.tsx");
 assert.match(header,/<CustomerCartLink \/>/);
 assert.match(cart,/className="apex-cart-toggle apex-customer-cart-link"/);
 assert.match(cart,/aria-expanded=\{open\}/);
 assert.match(cart,/aria-haspopup="dialog"/);
 assert.match(cart,/role="dialog" aria-modal="false"/);
 assert.match(cart,/setOpen\(current=>!current\)/);
 assert.match(cart,/document\.addEventListener\("pointerdown",outside\)/);
 assert.match(cart,/document\.addEventListener\("keydown",escape\)/);
 assert.match(cart,/event\.key==="Escape"/);
 assert.match(cart,/aria-label="Close cart"/);
 assert.doesNotMatch(cart,/<Link href="\/cart" className="apex-customer-cart-link"/);
});

test("mini cart estimates shipping, discount and total only from refreshed server quote",()=>{
 const source=read("src/app/cart/cart-provider.tsx");
 assert.match(source,/fetch\("\/api\/cart\/quote",\{/);
 assert.match(source,/cache:"no-store"/);
 assert.match(source,/signal:controller\.signal/);
 assert.match(source,/controller\.abort\(\)/);
 assert.match(source,/body:JSON\.stringify\(\{items,code:discountCode,boxSize:"auto"\}\)/);
 assert.match(source,/response\?\.key===key\?response\.quote:null/);
 assert.match(source,/normalizeDiscountEntry\(enteredCode\)/);
 assert.match(source,/setDiscountCode\(normalized\)/);
 assert.match(source,/onSubmit=\{applyCode\}/);
 assert.match(source,/Discount code \(optional\)/);
 assert.match(source,/Merchandise/);
 assert.match(source,/Discount/);
 assert.match(source,/Shipping/);
 assert.match(source,/Estimated total/);
 assert.match(source,/quote\.totalCents/);
 assert.match(source,/missingStock/);
 assert.match(source,/Out of stock or insufficient quantity/);
 assert.match(source,/canPlaceOrder\?:false;canPay\?:false/);
 assert.doesNotMatch(source,/createInvoice|createPayment|SUPABASE_SERVICE_ROLE_KEY|purchaseLabel|fetch\("\/api\/checkout\//);
});

test("discount selected in mini cart persists to full checkout review",()=>{
 const cart=read("src/app/cart/cart-provider.tsx");
 const full=read("src/app/cart/customer-cart-page.tsx");
 const route=read("src/app/checkout/page.tsx");
 assert.match(cart,/discountCode:string;setDiscountCode:\(value:string\)=>void/);
 assert.match(cart,/value=\{\{items,count,ready,discountCode,setDiscountCode/);
 assert.match(cart,/href="\/checkout"/);
 assert.match(cart,/>Checkout<\/Link>/);
 assert.match(route,/import CartPage from "\.\.\/cart\/page"/);
 assert.match(route,/return <CartPage\/>/);
 assert.match(full,/discountCode:code,setDiscountCode/);
 assert.match(full,/Checkout review/);
 assert.match(full,/Applied code:/);
 assert.match(full,/setDiscountCode\(cleaned\)/);
 assert.match(full,/setDiscountCode\(""\)/);
 assert.match(full,/Checkout unavailable/);
 assert.match(full,/NonpayableOrderPanel enabled=\{nonpayableEnabled\}/);
 const gate=read("src/app/cart/page.tsx");
 assert.match(gate,/isRetailNonpayableSubmissionEnabledV1\(process\.env\)/);
 assert.match(gate,/isRetailProductionReviewApprovedV1\(process\.env\)/);
 const payment=read("src/app/api/checkout/handoff/v1/route.ts");
 assert.match(payment,/CHECKOUT_UNAVAILABLE/);
 assert.match(payment,/status:503/);
});

test("cards show description, name and price, and report sold-out errors without adding product",()=>{
 const card=read("src/app/catalog/approved-sold-out-shelf.tsx");
 const detail=read("src/app/catalog/product/[id]/page.tsx");
 const button=read("src/app/cart/cart-provider.tsx");
 assert.match(card,/p\.name/);
 assert.match(card,/p\.description/);
 assert.match(card,/apex-approved-excerpt/);
 assert.match(card,/money\(p\.priceCents\)/);
 assert.match(card,/availability=\{p\.availability\}/);
 assert.match(detail,/money\(product\.priceCents\)/);
 assert.match(detail,/product\.description/);
 assert.match(detail,/availability=\{product\.availability\}/);
 assert.match(button,/if\(availability!=="in_stock"\)return/);
 assert.match(button,/onClick=\{\(\)=>setStockError\(true\)\}/);
 assert.match(button,/Out of stock —/);
 assert.match(button,/role="alert"/);
 assert.match(button,/onClick=\{\(\)=>\{setStockError\(false\);add\(id\);\}\}/);
 assert.match(card,/View full details/);
 const picked=changeCartItem([],product,1);
 assert.deepEqual(picked,[{product_id:product,quantity:1}]);
 assert.deepEqual(normalizeCartSelections(picked),picked);
});

test("server quote remains informational when items become sold out",()=>{
 const lines=[{product_id:product,quantity:1,name:"Sample",
  unit_price_cents:"4999",availability:"sold_out",can_checkout:false}];
 const source={
  schema_version:1,state:"rechecked_inventory_cart",items:lines,
  shipping:{charge_shipping:true,flat_shipping_cents:1500,
   medium_flat_shipping_cents:2580,free_shipping_min_subtotal_cents:20001,envelope_max_items:4},
  requested_code:"",promotion:null,can_place_order:false,can_create_invoice:false,
  can_reserve_stock:false,can_pay:false,
 };
 const review=buildCartReview(source,{items:[{product_id:product,quantity:1}],boxSize:"auto"});
 assert.equal(review.ok,true);
 assert.equal(review.status,"unavailable_stock");
 assert.equal(review.totalCents,6499);
 assert.equal(review.canPay,false);
 assert.equal(review.canPlaceOrder,false);
});

test("product tiles use a compact plus for another cart unit",()=>{
 const source=read("src/app/cart/cart-provider.tsx");
 assert.ok(source.includes('saved?"In cart — +":"+ "+actionLabel'));
 assert.doesNotMatch(source,/In cart — add another/);
 assert.match(source,/onClick=\{\(\)=>\{setStockError\(false\);add\(id\);\}\}/);
 assert.match(source,/disabled=\{saved&&items\.find\(item=>item\.product_id===id\)\?\.quantity===10\}/);
 assert.match(source,/if\(availability!=="in_stock"\)return/);
});
