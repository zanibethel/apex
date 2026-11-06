import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 reconcileIntakeWithSaved,supplierIntakeMatchSummary,MAX_CANDIDATES_PER_PARENT,
} from "../src/lib/catalog/supplier-intake-reconcile.mjs";

const read=path=>readFileSync(path,"utf8");
const parents=[
 {name:"Alpha-7",section:"Synthetic",held:0,options:[]},
 {name:"CJC-1295 with DAC",section:"Synthetic",held:0,options:[]},
 {name:"CJC-1295 without DAC",section:"Synthetic",held:1,options:[]},
 {name:"Unnamed Blend",section:"Synthetic",held:0,options:[]},
];
const uuid=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const saved=[
 {id:uuid(1),name:"Alpha 7 — 5 MG",sku:"SKU-1",price_cents:1200},
 {id:uuid(2),name:"Alpha-7 — 10 MG",sku:"SKU-2",price_cents:2400},
 {id:uuid(3),name:"CJC-1295 (with DAC) — 5 MG",sku:"SKU-3",price_cents:2500},
 {id:uuid(4),name:"CJC-1295 (without DAC) — 10 MG",sku:"SKU-4",price_cents:3600},
 {id:uuid(5),name:"Some Other Product — 5 MG",sku:"SKU-5",price_cents:2500},
];

test("parent identities are reconciled without flattening saved strengths or inventing variants",()=>{
 const result=reconcileIntakeWithSaved(parents,saved);
 assert.ok(result);
 assert.equal(result.length,4);
 assert.deepEqual(new Set(result[0].savedMatches.map(p=>p.id)),
  new Set([uuid(1),uuid(2)]));
 assert.equal(result[0].savedMatches.find(p=>p.id===uuid(2))?.priceCents,2400);
 assert.equal(result[1].savedMatches.length,1);
 assert.equal(result[1].savedMatches[0].id,uuid(3));
 assert.equal(result[2].savedMatches.length,1);
 assert.equal(result[2].savedMatches[0].id,uuid(4));
 assert.equal(result[3].savedMatches.length,0);
 assert.deepEqual(supplierIntakeMatchSummary(result),{
  proposedParents:4,parentsWithCandidates:3,savedCandidates:4,
  withoutCandidates:1,heldParents:1,
 });
});
test("nonexact base identities are never inferred from shared fragments",()=>{
 const cards=[{name:"ABC Blend",held:0},{name:"ABC",held:0},{name:"ABC Blend Extended",held:0}];
 const products=[{id:uuid(1),name:"ABC Blend Extended — 10 MG",sku:"ABC",price_cents:1000}];
 const result=reconcileIntakeWithSaved(cards,products);
 assert.deepEqual(result.map(c=>c.savedMatches.length),[0,0,1]);
});
test("invalid, colliding or incomplete identity sources fail closed",()=>{
 assert.equal(reconcileIntakeWithSaved([{name:"Alpha-7"},{name:"Alpha 7"}],saved),null);
 assert.equal(reconcileIntakeWithSaved(parents,[saved[0],saved[0]]),null);
 assert.equal(reconcileIntakeWithSaved(parents,[{...saved[0],id:"not-uuid"}]),null);
 assert.equal(reconcileIntakeWithSaved(parents,[{...saved[0],price_cents:"changed"}]),null);
 assert.equal(reconcileIntakeWithSaved(parents,Array.from(
  {length:MAX_CANDIDATES_PER_PARENT+1},(_,i)=>({
   id:uuid(i+1),name:"Alpha-7 — "+(i+1)+" MG",
   sku:String(i+1),price_cents:1000,
  })
 )),null);
});
test("candidate links go to private saved-product editing and never publish or auto-import",()=>{
 const page=read("src/app/supplier/catalog/bulk/page.tsx");
 const intake=read("src/app/supplier/catalog/supplier-intake-cards.tsx");
 const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
 assert.match(page,/reconcileIntakeWithSaved\(proposedCards,products\?\?\[\]\)/);
 assert.match(page,/\.eq\("store_id",store\.id\)\.eq\("is_published",false\)/);
 assert.match(page,/\(products\?\?\[\]\)\.some\(p=>p\.id===requestedEdit\)/);
 assert.match(page,/initialEditProductId=\{initialEditProductId\}/);
 assert.match(intake,/Possible existing product/);
 assert.match(intake,/savedMatches\.map/);
 assert.match(intake,/encodeURIComponent\(saved\.id\)\+"#saved-"\+saved\.id/);
 assert.match(intake,/Edit saved/);
 assert.match(intake,/No reliable saved name match yet/);
 assert.match(editor,/id=\{r\.id\?"saved-"\+r\.id:undefined\}/);
 assert.match(editor,/initialEditProductId&&initialRows\.some/);
 assert.doesNotMatch(intake,/createInvoice|createOrder|publish_storefront|service_role|saveBulkProductDrafts|\.insert\(/);
 assert.doesNotMatch(page,/service_role|createPublicUrl|is_published:true|createInvoice/);
});
