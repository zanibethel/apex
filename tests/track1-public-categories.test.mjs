import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {filterPublicCatalogPage,publicCatalogCategoryOptions} from "../src/lib/catalog/public-browse-filter.mjs";
const read=p=>readFileSync(p,"utf8");
const catA="64000000-0000-0000-0000-000000000004";
const catB="64000000-0000-0000-0000-000000000005";
const products=[
 {id:"1",name:"Daily Essentials",description:"Simple daily product",
  availability:"in_stock",categoryId:catA,categoryName:"Essentials"},
 {id:"2",name:"Training Basics",description:"Everyday collection",
  availability:"sold_out",categoryId:catB,categoryName:"Training"},
 {id:"3",name:"Recovery Basics",description:"Post-training",
  availability:"sold_out",categoryId:catB,categoryName:"Training"},
];
test("category facets are deduplicated and page-scoped",()=>{
 assert.deepEqual(publicCatalogCategoryOptions(products),[
  {id:catA,name:"Essentials"},{id:catB,name:"Training"},
 ]);
 assert.deepEqual(filterPublicCatalogPage(products,{categoryId:catB}).map(p=>p.id),["2","3"]);
 assert.deepEqual(filterPublicCatalogPage(products,{categoryId:catA,availability:"in_stock"}).map(p=>p.id),["1"]);
 assert.deepEqual(filterPublicCatalogPage(products,{categoryId:catB,availability:"in_stock"}),[]);
 assert.deepEqual(filterPublicCatalogPage(products,{query:"training"}).map(p=>p.id),["2","3"]);
});
test("missing or forged categories never become selectable public facets",()=>{
 assert.deepEqual(publicCatalogCategoryOptions([{...products[0],categoryId:null}]),[]);
 assert.deepEqual(publicCatalogCategoryOptions([{...products[0],categoryName:""}]),[]);
 assert.deepEqual(publicCatalogCategoryOptions([{...products[0],categoryId:"not-a-uuid"}]),[]);
 assert.deepEqual(filterPublicCatalogPage(products,{categoryId:"not-a-uuid"}),[]);
 assert.deepEqual(filterPublicCatalogPage([{...products[0],categoryId:null}],{categoryId:catA}),[]);
});
test("only the released category name and ID are added to the same strict public SQL",()=>{
 const old=read("supabase/migrations/20261104103000_apex_inventory_aware_catalog.sql");
 const next=read("supabase/migrations/20261105100000_apex_public_catalog_category_projection.sql");
 const s=next.slice(next.indexOf("create or replace function public.get_public_inventory_catalog"),next.indexOf("revoke all on function public.get_public_inventory_catalog"));
 for(const required of [
  "private_release_gate","sa.status='verified'","pa.status='verified'",
  "cat.is_published=true","c.admin_gate='clear'",
  "c.supplier_wants_listing=true","republish_approval_required",
  "listing_identity_holds","quantity_reserved between 0 and i.quantity_on_hand",
  "'category_id',eligible.category_id","'category_name',eligible.category_name",
  "'can_checkout',false",
 ])assert.ok(s.includes(required),required);
 for(const privateField of ["'image_path',","'supplier_id',","'quantity_on_hand',","'source_cost_cents',"]){
  assert.ok(!s.includes(privateField),privateField);
 }
 assert.match(old,/cat.is_published=true/);
 assert.match(next,/has_table_privilege\('anon','public\.inventory_items','SELECT'\)/);
});
test("strict public TypeScript parser supports rollout but refuses private fields",()=>{
 const client=read("src/lib/supabase/approved-sold-out-catalog.ts");
 const shelf=read("src/app/catalog/approved-sold-out-shelf.tsx");
 assert.match(client,/categoryKeys=\["category_id","category_name"\]/);
 assert.match(client,/typeof row\.category_name!=="string"/);
 assert.match(client,/typeof row\.category_id!=="string"/);
 assert.match(client,/row\.can_checkout!==false/);
 assert.match(client,/get_public_retail_showcase_catalog/);
 assert.match(shelf,/publicCatalogCategoryOptions/);
 assert.match(shelf,/Category/);
 assert.match(shelf,/p\.categoryName\?\?"APEX COLLECTION"/);
 assert.match(shelf,/p\.availability==="in_stock"/);
 assert.doesNotMatch(client,/service_role|inventory_items|\.update\(/);
});
