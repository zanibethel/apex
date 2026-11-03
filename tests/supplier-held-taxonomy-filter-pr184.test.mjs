import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {BULK_VIEW_FILTERS,filterSupplierBulkRows}
 from "../src/lib/catalog/bulk-workspace-filter.mjs";
import {apexTaxonomyProposal}
 from "../src/lib/catalog/apex-reviewed-taxonomy-20261102.mjs";

const held=apexTaxonomyProposal.filter(item=>item.category===null);
const suggested=apexTaxonomyProposal.find(item=>item.category!==null);
const heldIds=new Set(held.map(item=>item.id));
const newDraft={key:"new-unsigned-draft",name:"Unsaved product",sku:"",needsSave:true};
const first={key:held[0].id,id:held[0].id,name:"Supplier corrected name",sku:"REVISED-IDENTITY",needsSave:true,categoryId:""};
const second={key:suggested.id,id:suggested.id,name:suggested.name,sku:suggested.sku,categoryId:"",needsSave:false};

test("held taxonomy filter focuses the 13 exact product identities without changing data",()=>{
 assert.equal(held.length,13);
 assert.ok(BULK_VIEW_FILTERS.includes("taxonomy_held"));
 const rows=[newDraft,first,second];
 const frozen=structuredClone(rows);
 const result=filterSupplierBulkRows(rows,"","taxonomy_held",[],
  new Set(),new Set(),heldIds);
 assert.deepEqual(result,[first]);
 assert.strictEqual(result[0],first);
 assert.deepEqual(rows,frozen);
});
test("new drafts and unrelated products are excluded; existing query narrows held results",()=>{
 const other={key:held[1].id,id:held[1].id,name:"Other held name",sku:"REVISED-2"};
 const rows=[other,first,second,newDraft];
 assert.deepEqual(filterSupplierBulkRows(rows,"supplier corrected","taxonomy_held",[],
  new Set(),new Set(),heldIds),[first]);
 assert.deepEqual(filterSupplierBulkRows(rows,"absent","taxonomy_held",[],
  new Set(),new Set(),heldIds),[]);
 assert.deepEqual(filterSupplierBulkRows(rows,"","taxonomy_held"),[]);
 assert.deepEqual(filterSupplierBulkRows(rows,"","all"),rows,
  "Existing All products filter remains unchanged");
});
test("UI shows review notes on matching product cards with no additional save/approval RPC",()=>{
 const code=readFileSync("src/app/supplier/catalog/bulk-editor.tsx","utf8");
 const helper=readFileSync("src/lib/catalog/bulk-workspace-filter.mjs","utf8");
 assert.match(code,/heldTaxonomyIds/);
 assert.match(code,/value="taxonomy_held"/);
 assert.match(code,/Review \{heldTaxonomyIds\.size\} flagged products/);
 assert.match(code,/setViewFilter\("taxonomy_held"\)/);
 assert.match(code,/const taxonomyHold=r\.id\?heldTaxonomy\.get\(r\.id\):undefined/);
 assert.match(code,/Identity review required:/);
 assert.match(code,/Check source documentation/);
 assert.doesNotMatch(helper,/\.update\(|\.insert\(|\.upsert\(|rpc\(/);
});
