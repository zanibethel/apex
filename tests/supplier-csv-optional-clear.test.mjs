import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseProductCsv,buildProductCsv} from "../src/lib/catalog/product-csv.mjs";
import {csvEditableOptionalText,csvEditableCategoryId}
 from "../src/lib/catalog/csv-optional-field-changes.mjs";

const importer=readFileSync("src/app/supplier/catalog/csv-product-import.tsx","utf8");
const categories=new Map([["getswole","category-one"],["other","category-two"]]);

test("existing CSV draft fields explicitly blank clear description, compare-at and category",()=>{
 const parsed=parseProductCsv('product_id,sku,title,description,price,compare_at_price,category\r\n'+
  '00000000-0000-4000-8000-000000000001,TEST-1,Updated,,50.00,,\r\n');
 assert.deepEqual(parsed.errors,[]);
 const r=parsed.rows[0];
 assert.equal(csvEditableOptionalText(r,"description","Old description"),"");
 assert.equal(csvEditableOptionalText(r,"compare_at_price","65.00"),"");
 assert.equal(csvEditableCategoryId(r,"category-one",categories),"");
});

test("omitted optional CSV columns preserve existing values",()=>{
 const parsed=parseProductCsv("title,price\r\nUpdated,45.00\r\n");
 assert.deepEqual(parsed.errors,[]);
 const r=parsed.rows[0];
 assert.equal(csvEditableOptionalText(r,"description","Keep this description"),"Keep this description");
 assert.equal(csvEditableOptionalText(r,"compare_at_price","90.00"),"90.00");
 assert.equal(csvEditableCategoryId(r,"category-one",categories),"category-one");
 assert.equal(csvEditableOptionalText({description:"New"},"description","Old"),"New");
 assert.equal(csvEditableCategoryId({category:"Other"},"category-one",categories),"category-two");
 assert.equal(csvEditableCategoryId({category:"Missing"},"category-one",categories),"");
});

test("exported saved draft with deliberately cleared fields round-trips through real parser",()=>{
 const original={
  product_id:"00000000-0000-4000-8000-000000000001",
  sku:"DEMO-SKU",title:"Updated synthetic",
  description:"",source_cost:"15.00",price:"30.00",
  compare_at_price:"",category:"",active:"true",
 };
 const parsed=parseProductCsv(buildProductCsv([original]));
 assert.deepEqual(parsed.errors,[]);
 const r=parsed.rows[0];
 assert.equal(r.product_id,original.product_id);
 assert.equal(csvEditableOptionalText(r,"description","Old description"),"");
 assert.equal(csvEditableOptionalText(r,"compare_at_price","50.00"),"");
 assert.equal(csvEditableCategoryId(r,"category-one",categories),"");
 assert.equal(r.source_cost,"15.00");
});

test("client applies optional-clear helper only to requested fields and keeps source cost preserve",()=>{
 assert.match(importer,/csvEditableOptionalText\(item,"description",target\?\.description\)/);
 assert.match(importer,/csvEditableOptionalText\(item,"compare_at_price",target\?\.comparePrice\)/);
 assert.match(importer,/csvEditableCategoryId\(item,target\?\.categoryId,byCategory\)/);
 assert.match(importer,/sourceCost:item\.source_cost\|\|target\?\.sourceCost\|\|""/);
 assert.match(importer,/if\(categoryName&&!categoryId\)issue="Unknown category/);
 assert.match(importer,/Blank description, compare-at price or category clears/);
 assert.match(importer,/Omitted columns preserve existing values/);
 assert.match(importer,/Blank source cost preserves the existing cost/);
 assert.match(importer,/target\?\.id/);
 assert.match(importer,/Duplicate product in CSV/);
 assert.doesNotMatch(importer,/publish_storefront|service_role|createPublicUrl|is_published:true/);
});
