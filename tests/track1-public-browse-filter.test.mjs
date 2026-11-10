import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {filterPublicCatalogPage,BROWSE_AVAILABILITY} from "../src/lib/catalog/public-browse-filter.mjs";
const rows=[
 {id:"1",name:"Strength Essentials",description:"Daily essentials",availability:"in_stock"},
 {id:"2",name:"Training Basics",description:"Everyday equipment",availability:"sold_out"},
 {id:"3",name:"Active Recovery",description:"Post training",availability:"sold_out"},
];
test("mobile browse search matches title and description, order-independent",()=>{
 assert.deepEqual(filterPublicCatalogPage(rows,{query:"TRAINING"}).map(x=>x.id),["2","3"]);
 assert.deepEqual(filterPublicCatalogPage(rows,{query:"  DAILY   essentials "}).map(x=>x.id),["1"]);
 assert.deepEqual(filterPublicCatalogPage(rows,{query:"nothing"}),[]);
 assert.deepEqual(filterPublicCatalogPage(rows),rows);
});
test("availability filters never convert sold out to in stock",()=>{
 assert.deepEqual(BROWSE_AVAILABILITY,["all","in_stock","sold_out"]);
 assert.deepEqual(filterPublicCatalogPage(rows,{availability:"in_stock"}).map(x=>x.id),["1"]);
 assert.deepEqual(filterPublicCatalogPage(rows,{availability:"sold_out"}).map(x=>x.id),["2","3"]);
 for(const invalid of [{availability:"published"},{query:"x".repeat(65)}]){
  assert.deepEqual(filterPublicCatalogPage(rows,invalid),[]);
 }
 assert.deepEqual(filterPublicCatalogPage([{...rows[0],availability:"invented"}]),[]);
});
test("public filtering is only applied after release-gated projection, never private inventory",()=>{
 const shelf=readFileSync("src/app/catalog/approved-sold-out-shelf.tsx","utf8");
 const page=readFileSync("src/app/catalog/page.tsx","utf8");
 assert.match(page,/readApprovedSoldOutCatalog/);
 assert.match(shelf,/filterPublicCatalogPage/);
 assert.match(shelf,/Search this page/);
 assert.match(shelf,/p.availability==="in_stock"/);
 assert.match(shelf,/Browse current product listings|Browse supplier-published ordinary retail samples/);
 assert.match(shelf,/Browsing only/);
 assert.doesNotMatch(shelf,/service_role|private.*inventory|\.(?:insert|update|delete)\(/);
});
