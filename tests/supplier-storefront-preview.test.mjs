import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {initialShowroomState,showroomVisible,showroomCartSummary} from "../src/lib/catalog/supplier-showroom-preview.mjs";

const read=path=>readFileSync(path,"utf8");
const p=(id,name,active=true,inStock=false)=>({
 id,name,sku:"TEST-"+id,category:"Private test category",active,
 initialInStock:inStock,priceCents:1200,currency:"USD",
});
const products=[p("one","One",true,true),p("two","Two",true,false),p("three","Three",false,true)];

test("private preview separates visibility and in-stock state",()=>{
 const initial=initialShowroomState(products);
 assert.equal(initial.one.visible,true);
 assert.equal(initial.one.inStock,true);
 assert.equal(initial.two.visible,true);
 assert.equal(initial.two.inStock,false);
 assert.equal(initial.three.visible,false);
 assert.equal(initial.three.inStock,true);
 let next={...initial,two:{visible:true,inStock:true}};
 assert.equal(showroomVisible(products,next).length,2);
 next={...next,one:{visible:true,inStock:false}};
 assert.equal(showroomVisible(products,next).length,2,"out of stock stays visible");
 next={...next,two:{visible:false,inStock:true}};
 assert.equal(showroomVisible(products,next).length,1,"hidden listings disappear from preview only");
});

test("test cart ignores hidden/out-of-stock items and computes a local subtotal",()=>{
 const initial=initialShowroomState(products);
 assert.deepEqual(showroomCartSummary(products,initial,{one:2,two:2,three:1}),{
  count:2,subtotalCents:2400,
  items:[{id:"one",name:"One",quantity:2,priceCents:1200}],
 });
 assert.equal(showroomCartSummary(products,initial,{one:99}).count,0,"excessive quantity excluded");
 assert.equal(showroomCartSummary(products,initial,{nonexistent:1}).subtotalCents,0);
});

test("preview is supplier owner/manager-only, RLS-scoped, fail-closed and cannot change real release or checkout",()=>{
 const server=read("src/app/supplier/catalog/storefront-test/page.tsx");
 const component=read("src/app/supplier/catalog/storefront-test/supplier-showroom.tsx");
 const helper=read("src/lib/catalog/supplier-showroom-preview.mjs");
 const supplier=read("src/app/supplier/page.tsx");
 assert.match(server,/createSupplierServerClient\(\)/);
 assert.match(server,/client\.auth\.getUser\(\)/);
 assert.match(server,/\.in\("role",\["owner","manager"\]\)/);
 assert.match(server,/\.eq\("store_id",store\.id\)/);
 assert.match(server,/productCount!==products\?\.length/);
 assert.match(server,/stores\?\.length!==1/);
 assert.match(server,/createSignedUrl\(p\.image_path!,300\)/);
 assert.match(server,/index:false/);
 assert.match(supplier,/\/supplier\/catalog\/storefront-test/);
 assert.match(component,/Show product/);
 assert.match(component,/In stock/);
 assert.match(component,/Out of stock/);
 assert.match(component,/Add to test cart/);
 assert.match(component,/No checkout or payment/);
 assert.match(component,/Reset preview/);
 assert.match(component,/private, local simulation/);
 assert.doesNotMatch(server+component+helper,/service_role|SUPABASE_SECRET|createInvoice|set_supplier_listing_intent|\.insert\(|\.update\(|\.upsert\(|\.delete\(/i);
 assert.doesNotMatch(component,/useCustomerCart|\/api\/checkout|window\.localStorage|fetch\s*\(/);
});
