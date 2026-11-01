import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseProductCsv} from "../src/lib/catalog/product-csv.mjs";
import {matchRepeatedBlankSkuCard} from "../src/lib/catalog/csv-repeat-blank-sku.mjs";
import {draftSkuFromUuid} from "../src/lib/catalog/sku-format.mjs";
import {prioritizeImportedProducts} from "../src/lib/catalog/prioritize-imported-products.mjs";
const importer=readFileSync("src/app/supplier/catalog/csv-product-import.tsx","utf8");

const previousCsv="title,price,description\r\nSample A,20.00,Old A\r\nSample A,30.00,Old B\r\n";
const currentCsv="title,price,description\r\nSample A,21.00,New A\r\nSample A,31.00,New B\r\n";
const original=parseProductCsv(previousCsv);
const updated=parseProductCsv(currentCsv);
const uuid1="a1234567-1234-4123-8123-123456789abc";
const uuid2="b1234567-1234-4123-8123-123456789abc";
const rows=[
 {key:"new-1",name:"Sample A",sku:draftSkuFromUuid("Sample A",uuid1),price:"20.00",description:"Old A",needsSave:true},
 {key:"new-2",name:"Sample A",sku:draftSkuFromUuid("Sample A",uuid2),price:"30.00",description:"Old B",needsSave:true},
];
const staged=original.rows.map((source,i)=>({
 key:rows[i].key,line:source.line,row:rows[i],originalBlankSku:true,
}));

test("same-file blank-SKU reimport retains two unique staged cards, generated SKUs and order",()=>{
 assert.deepEqual(original.errors,[]);
 assert.deepEqual(updated.errors,[]);
 const mapped=updated.rows.map(item=>{
  const matched=matchRepeatedBlankSkuCard(
   "synthetic-products.csv","synthetic-products.csv",staged,rows,item.line,item.title);
  assert.ok(matched);
  return {...matched,name:item.title,price:item.price,description:item.description,needsSave:true};
 });
 assert.equal(mapped.length,2);
 assert.equal(mapped[0].key,"new-1");
 assert.equal(mapped[1].key,"new-2");
 assert.notEqual(mapped[0].sku,mapped[1].sku);
 assert.deepEqual(mapped.map(x=>x.price),["21.00","31.00"]);
 const after=prioritizeImportedProducts(rows,mapped);
 assert.equal(after.length,2);
 assert.deepEqual(after.map(x=>x.sku),rows.map(x=>x.sku));
 assert.deepEqual(after.map(x=>x.description),["New A","New B"]);
});

test("match is strictly same filename, source line and title",()=>{
 const lookup=(name,line,title)=>
  matchRepeatedBlankSkuCard("synthetic-products.csv",name,staged,rows,line,title);
 assert.equal(lookup("synthetic-products.csv",2,"Sample A")?.key,"new-1");
 assert.equal(lookup("synthetic-products.csv",3,"Sample A")?.key,"new-2");
 assert.equal(lookup("other-products.csv",2,"Sample A"),undefined);
 assert.equal(lookup("synthetic-products.csv",2,"Different product"),undefined);
 assert.equal(lookup("synthetic-products.csv",4,"Sample A"),undefined);
 assert.equal(lookup("synthetic-products.csv",0,"Sample A"),undefined);
 assert.equal(lookup("synthetic-products.csv",2,""),undefined);
 assert.equal(matchRepeatedBlankSkuCard("", "synthetic-products.csv",staged,rows,2,"Sample A"),undefined);
});

test("removed, saved, blocked and ambiguous staged cards are not silently reused",()=>{
 assert.equal(matchRepeatedBlankSkuCard("a.csv","a.csv",staged,[],2,"Sample A"),undefined);
 assert.equal(matchRepeatedBlankSkuCard("a.csv","a.csv",staged,[{...rows[0],id:uuid1}],2,"Sample A"),undefined);
 assert.equal(matchRepeatedBlankSkuCard("a.csv","a.csv",[
  {...staged[0],issue:"Unknown category"}],rows,2,"Sample A"),undefined);
 assert.equal(matchRepeatedBlankSkuCard("a.csv","a.csv",[
  staged[0],{...staged[0],row:{...staged[0].row,key:"other-key"}}],
  rows,2,"Sample A"),undefined);
 assert.equal(matchRepeatedBlankSkuCard("a.csv","a.csv",[
  {...staged[0],originalBlankSku:false}],rows,2,"Sample A"),undefined);
});

test("UI stages blank-SKU import provenance but never uses it to overwrite saved IDs",()=>{
 assert.match(importer,/import \{matchRepeatedBlankSkuCard\} from/);
 assert.match(importer,/const previousStaged=staged/);
 assert.match(importer,/const previousFileName=fileName/);
 assert.match(importer,/matchRepeatedBlankSkuCard\(previousFileName,file\.name,previousStaged,rows,item\.line,item\.title\)/);
 assert.match(importer,/!sku&&!item\.product_id/);
 assert.match(importer,/const target=explicit\|\|matched\|\|reimportedBlank/);
 assert.match(importer,/originalBlankSku:!sku&&!item\.product_id/);
 assert.match(importer,/reimportedBlank&&ambiguousSkus\.has\(reimportedBlank\.sku\.toUpperCase\(\)\)/);
 assert.match(importer,/sku:sku\|\|target\?\.sku\|\|draftSkuFromUuid/);
 assert.match(importer,/id:target\?\.id/);
 assert.match(importer,/if\(item\.product_id&&!explicit\)/);
 assert.match(importer,/e\.target\.value="";void upload\(file\)/);
 assert.doesNotMatch(importer,/service_role|createPublicUrl|is_published:true|publish_storefront|\.rpc\(/);
});
