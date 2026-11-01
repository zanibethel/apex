import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {privateProductCsvExportBatches,PRIVATE_PRODUCT_CSV_EXPORT_BATCH_SIZE}
 from "../src/lib/catalog/private-csv-export-batches.mjs";
import {buildProductCsv,parseProductCsv}
 from "../src/lib/catalog/product-csv.mjs";

const importer=readFileSync("src/app/supplier/catalog/csv-product-import.tsx","utf8");
const fixtures=Array.from({length:250},(_,i)=>{
 const n=i+1;
 return {
  key:"card-"+n,
  id:"00000000-0000-4000-8000-"+String(n).padStart(12,"0"),
  sku:"APX-CSV-"+String(n).padStart(3,"0"),
  name:"Synthetic sample "+n,
  description:"Test description "+n+" with comma, quote \" and newline\nsecond line",
  sourceCost:(n/10).toFixed(2),price:(20+n/100).toFixed(2),
  comparePrice:(30+n/100).toFixed(2),categoryId:"get-swole-cat",
  isActive:n%2===0,needsSave:false,
 };
});

function serialize(batch){
 return buildProductCsv(batch.rows.map(row=>({
  product_id:row.id,sku:row.sku,title:row.name,description:row.description,
  source_cost:row.sourceCost,price:row.price,compare_at_price:row.comparePrice,
  category:"GetSwole",active:row.isActive?"true":"false",
 })));
}

test("250 saved cards export in three independently importable CSV files",()=>{
 assert.equal(PRIVATE_PRODUCT_CSV_EXPORT_BATCH_SIZE,100);
 const parts=privateProductCsvExportBatches(fixtures);
 assert.deepEqual(parts.map(p=>[p.start,p.end,p.rows.length,p.filename]),[
  [1,100,100,"apex-private-products-001-100.csv"],
  [101,200,100,"apex-private-products-101-200.csv"],
  [201,250,50,"apex-private-products-201-250.csv"],
 ]);
 const all=parts.flatMap(part=>{
  const parsed=parseProductCsv(serialize(part));
  assert.deepEqual(parsed.errors,[]);
  assert.equal(parsed.rows.length,part.rows.length);
  assert.ok(new TextEncoder().encode(serialize(part)).length<=256000);
  return parsed.rows;
 });
 assert.deepEqual(all.map(row=>row.product_id),fixtures.map(row=>row.id));
 assert.deepEqual(all.map(row=>row.sku),fixtures.map(row=>row.sku));
 assert.deepEqual(all.map(row=>row.title),fixtures.map(row=>row.name));
 assert.deepEqual(all.map(row=>row.description),fixtures.map(row=>row.description));
 assert.deepEqual(all.map(row=>row.price),fixtures.map(row=>row.price));
 assert.deepEqual(all.map(row=>row.compare_at_price),fixtures.map(row=>row.comparePrice));
 assert.deepEqual(all.map(row=>row.source_cost),fixtures.map(row=>row.sourceCost));
 assert.ok(all.every(row=>row.category==="GetSwole"));
});

test("a small export uses the familiar filename and never includes a new unsaved ID-less card",()=>{
 assert.deepEqual(privateProductCsvExportBatches([]),[]);
 assert.deepEqual(privateProductCsvExportBatches(null),[]);
 const one=privateProductCsvExportBatches([...fixtures.slice(0,1),{key:"new",name:"Unsaved",needsSave:true}]);
 assert.equal(one.length,1);
 assert.equal(one[0].filename,"apex-private-products.csv");
 assert.equal(one[0].rows.length,1);
 assert.equal(one[0].rows[0].id,fixtures[0].id);
 assert.deepEqual(privateProductCsvExportBatches(fixtures.slice(0,100)).map(x=>x.rows.length),[100]);
 assert.deepEqual(privateProductCsvExportBatches(fixtures.slice(0,101)).map(x=>x.rows.length),[100,1]);
});

test("export part buttons are explicitly user initiated on mobile and use current editor values",()=>{
 assert.match(importer,/const exportBatches=privateProductCsvExportBatches\(rows\)/);
 assert.match(importer,/function exportSavedBatch/);
 assert.match(importer,/onClick=\{\(\)=>exportSavedBatch\(batch\)\}/);
 assert.match(importer,/saveCsv\(buildProductCsv\(items\),batch\.filename\)/);
 assert.match(importer,/a\.download=filename/);
 assert.match(importer,/Export CSV/);
 assert.match(importer,/Download each file separately/);
 assert.match(importer,/including any unsaved edits/);
 assert.match(importer,/disabled=\{disabled\}/);
 assert.match(importer,/Export editor CSV/);
 assert.match(importer,/setStaged\(mapped\)/);
 assert.match(importer,/onLoad\(valid\.map\(r=>r\.row\)\)/);
 assert.doesNotMatch(importer,/service_role|createPublicUrl|is_published:true|publish_storefront|\.rpc\(/);
});
