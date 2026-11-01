import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {csvExistingCardLookup} from "../src/lib/catalog/csv-existing-card-lookup.mjs";
import {prioritizeImportedProducts} from "../src/lib/catalog/prioritize-imported-products.mjs";
import {parseProductCsv} from "../src/lib/catalog/product-csv.mjs";

const importer=readFileSync("src/app/supplier/catalog/csv-product-import.tsx","utf8");
const oldSaved={key:"saved-1",id:"00000000-0000-4000-8000-000000000001",
 sku:"APX-SAVED",name:"Original saved",needsSave:false};
const newUnsaved={key:"staged-1",sku:"APX-STAGED",name:"Original staged",needsSave:true};

test("the existing card lookup includes saved and unsaved SKUs without normalizing away their keys",()=>{
 const {byId,bySku,ambiguousSkus}=csvExistingCardLookup([oldSaved,newUnsaved]);
 assert.equal(byId.get(oldSaved.id).key,"saved-1");
 assert.equal(bySku.get("APX-SAVED"),oldSaved);
 assert.equal(bySku.get("APX-STAGED"),newUnsaved);
 assert.equal(byId.size,1);
 assert.equal(ambiguousSkus.size,0);
 assert.equal(csvExistingCardLookup(null).bySku.size,0);
});

test("re-importing the same unsaved SKU updates one card, retaining the original key and 250 card capacity",()=>{
 const csv="sku,title,price\r\nAPX-STAGED,Revised staged,44.00\r\n";
 const first=parseProductCsv(csv);
 assert.deepEqual(first.errors,[]);
 const existing=[oldSaved,newUnsaved];
 const firstLookup=csvExistingCardLookup(existing);
 const same=firstLookup.bySku.get(first.rows[0].sku.toUpperCase());
 assert.equal(same.key,"staged-1");
 const updated={...same,name:first.rows[0].title,price:first.rows[0].price,needsSave:true};
 const after=prioritizeImportedProducts(existing,[updated]);
 assert.equal(after.length,2);
 assert.deepEqual(after.map(x=>x.key),["staged-1","saved-1"]);
 assert.equal(after[0].price,"44.00");
 const secondLookup=csvExistingCardLookup(after);
 assert.equal(secondLookup.bySku.get("APX-STAGED").key,"staged-1");
 assert.equal(prioritizeImportedProducts(after,[{...updated,name:"Third upload"}]).length,2);
});

test("case-insensitive duplicate saved and unsaved SKU does not pick an arbitrary editor card",()=>{
 const rows=[oldSaved,newUnsaved,{key:"duplicate-1",sku:"apx-staged",needsSave:true}];
 const lookup=csvExistingCardLookup(rows);
 assert.equal(lookup.bySku.get("APX-STAGED"),undefined);
 assert.equal(lookup.ambiguousSkus.has("APX-STAGED"),true);
 assert.equal(lookup.bySku.get("APX-SAVED"),oldSaved);
 assert.equal(lookup.byId.get(oldSaved.id),oldSaved);
 const reversed=csvExistingCardLookup([...rows].reverse());
 assert.equal(reversed.bySku.get("APX-STAGED"),undefined);
 assert.equal(reversed.ambiguousSkus.has("APX-STAGED"),true);
});

test("CSV importer requires matching product ID and SKU to resolve the same editor card",()=>{
 assert.match(importer,/csvExistingCardLookup\(rows\)/);
 assert.match(importer,/const explicit=item\.product_id\?byId\.get/);
 assert.match(importer,/const matched=sku\?bySku\.get\(sku\):undefined/);
 assert.match(importer,/const target=explicit\|\|matched/);
 assert.match(importer,/explicit&&matched&&explicit\.key!==matched\.key/);
 assert.match(importer,/ambiguousSkus\.has\(sku\)/);
 assert.match(importer,/SKU matches multiple editor cards/);
 assert.match(importer,/if\(item\.product_id&&!explicit\)/);
 assert.match(importer,/Duplicate product in CSV/);
 assert.match(importer,/target\?\.key\?\?crypto\.randomUUID\(\)/);
 assert.match(importer,/onLoad\(valid\.map\(r=>r\.row\)\)/);
});

test("same-file Safari upload remains possible and no save is automatic",()=>{
 assert.match(importer,/const file=e\.target\.files\?\.\[0\];e\.target\.value="";void upload\(file\)/);
 assert.match(importer,/Re-uploading the same file updates staged cards/);
 assert.match(importer,/Save selected to create or update the private products/);
 assert.doesNotMatch(importer,/service_role|createPublicUrl|publish_storefront|is_published:true|\.rpc\(/);
});
