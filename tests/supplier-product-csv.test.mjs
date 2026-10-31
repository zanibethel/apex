import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PRODUCT_CSV_HEADERS,PRODUCT_CSV_TEMPLATE,csvCell,buildProductCsv,parseProductCsv}
 from "../src/lib/catalog/product-csv.mjs";
const bulkPage=readFileSync("src/app/supplier/catalog/bulk/page.tsx","utf8");
const bulkEditor=readFileSync("src/app/supplier/catalog/bulk-editor.tsx","utf8");
const importer=readFileSync("src/app/supplier/catalog/csv-product-import.tsx","utf8");
const bulkActions=readFileSync("src/app/supplier/catalog/bulk-actions.ts","utf8");
const operations=readFileSync("src/app/supplier/operations/actions.ts","utf8");
const template=readFileSync("public/templates/apex-product-import-template.csv","utf8");
const title="product_id,sku,title,description,source_cost,price,compare_at_price,category,active";
function raw(...data){return title+"\r\n"+data.join("\r\n")+"\r\n"}

test("template is downloadable CSV with exactly supported header fields",()=>{
 assert.deepEqual(PRODUCT_CSV_HEADERS,["product_id","sku","title","description",
  "source_cost","price","compare_at_price","category","active"]);
 assert.equal(PRODUCT_CSV_TEMPLATE.trim(),title);
 assert.equal(template.trim(),title);
 assert.match(importer,/href="\/templates\/apex-product-import-template.csv"/);
 assert.match(importer,/download/);
});
test("quoted commas, quotes and embedded newlines preserve text",()=>{
 const sample=raw(',"ART-001","Example","Part ""A"", glass\nNew line",12.45,25.00,35.00,GetSwole,true');
 const result=parseProductCsv(sample);
 assert.deepEqual(result.errors,[]);
 assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].description,'Part "A", glass\nNew line');
 assert.equal(result.rows[0].line,2);
});
test("export escapes quoted CSV values and prevents spreadsheet formula execution",()=>{
 assert.equal(csvCell('A"B'),'"A""B"');
 assert.equal(csvCell("=HYPERLINK(A1)"),'"\'=HYPERLINK(A1)"');
 const exported=buildProductCsv([{product_id:"",sku:"T-1",title:"Sample, 1",
  description:"Two\nlines",source_cost:"12.00",price:"20.00",
  compare_at_price:"30.00",category:"Example",active:"true"}]);
 assert.deepEqual(parseProductCsv(exported).errors,[]);
 assert.equal(parseProductCsv(exported).rows[0].title,"Sample, 1");
});
test("reject malformed headers, duplicate columns and unexpected values",()=>{
 assert.match(parseProductCsv("title,price,bad_column\nExample,20.00,x\n").errors.join(" "),/Unknown columns/);
 assert.match(parseProductCsv("title,title,price\nExample,Example,20.00\n").errors.join(" "),/Duplicate columns/);
 assert.match(parseProductCsv("title,price\nBad,-1.00\n").errors.join(" "),/check title/);
 assert.match(parseProductCsv("title,price\n=cmd,10.00\n").errors.join(" "),/formula-style/);
 assert.match(parseProductCsv("title,price\nExample,10.00,extra\n").errors.join(" "),/expected/);
 assert.match(parseProductCsv("title,price\n\"Example,10.00\n").errors.join(" "),/unclosed/);
 assert.match(parseProductCsv("title,price\nExample,10.00\n".repeat(101)).errors.join(" "),/100 product rows/);
});
test("limit imported rows and CSV file size",()=>{
 const sample=raw(...Array.from({length:101},(_,i)=>"EX-"+i+",10.00"));
 const short="title,price\r\n"+Array.from({length:101},(_,i)=>"EX-"+i+",10.00\r\n").join("");
 assert.match(parseProductCsv(short).errors.join(" "),/100 product rows/);
 assert.match(parseProductCsv("x".repeat(256001)).errors.join(" "),/256 KB/);
});
test("UI loads CSV to editable staged rows but never saves or publishes on upload",()=>{
 assert.match(importer,/parseProductCsv\(await file\.text\(\)\)/);
 assert.match(importer,/Product ID does not belong to this store/);
 assert.match(importer,/Unknown category/);
 assert.match(importer,/Duplicate product in CSV/);
 assert.match(importer,/setStaged\(mapped\)/);
 assert.match(importer,/onLoad\(chosen\)/);
 assert.match(importer,/Load checked rows into editor/);
 assert.match(importer,/Export current products CSV/);
 assert.match(bulkEditor,/CsvProductImport/);
 assert.match(bulkEditor,/loadFromCsv/);
 assert.match(bulkEditor,/sourceCost/);
 assert.match(bulkPage,/internal_source_cost_cents/);
 assert.match(bulkPage,/supplier_candidate_drafts/);
 assert.doesNotMatch(importer,/\.rpc\(|\.from\("products"\)|publish_storefront|service_role/);
});
test("server validates source costs and uses existing guarded draft actions",()=>{
 assert.match(bulkActions,/moneyPattern\.test\(r\.sourceCost\)/);
 assert.match(bulkActions,/internal_source_cost_cents/);
 assert.match(bulkActions,/rowForm\.set\("directSourceCost"/);
 assert.match(bulkActions,/updateDraftProduct/);
 assert.match(bulkActions,/createDraftProduct/);
 assert.match(operations,/supplier_candidate_drafts/);
 assert.doesNotMatch(bulkActions,/is_published:true|is_public:true|service_role/);
});
