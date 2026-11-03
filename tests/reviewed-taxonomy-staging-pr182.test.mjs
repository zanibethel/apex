import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 apexTaxonomyProposal,apexTaxonomyCategoryNames,apexTaxonomyStoreId,
} from "../src/lib/catalog/apex-reviewed-taxonomy-20261102.mjs";
import {assessReviewedTaxonomy,stageReviewedTaxonomy}
 from "../src/lib/catalog/reviewed-taxonomy-staging.mjs";

const read=p=>readFileSync(p,"utf8");
const GETSWOLE="edc20d0c-55d9-4bf9-b397-a669d36d7b99";
const assigned=apexTaxonomyProposal.find(r=>r.status==="Keep existing");
const row=item=>({
 key:item.id,id:item.id,sku:item.sku,name:item.name,
 categoryId:item.status==="Keep existing"?GETSWOLE:"",
 isActive:item.status==="Keep existing",
 description:"Do not overwrite description",price:"40.00",
 comparePrice:"80.00",sourceCost:"20.00",needsSave:false,
});
const stored=()=>apexTaxonomyProposal.map(row);
const ids=[GETSWOLE,...apexTaxonomyCategoryNames.map((_,i)=>
 "63000000-0000-0000-0000-"+String(i+10).padStart(12,"0"))];
const allCategories=()=>[
 {id:GETSWOLE,name:"GetSwole"},
 ...apexTaxonomyCategoryNames.map((name,i)=>({id:ids[i+1],name})),
];

test("reviewed mapping is exact, fixed-scope and matches documentation",()=>{
 assert.equal(apexTaxonomyProposal.length,63);
 assert.equal(new Set(apexTaxonomyProposal.map(x=>x.id)).size,63);
 assert.equal(new Set(apexTaxonomyProposal.map(x=>x.sku)).size,63);
 assert.equal(apexTaxonomyProposal.filter(x=>x.category===null).length,13);
 assert.equal(apexTaxonomyProposal.filter(x=>x.category!==null).length,50);
 assert.equal(apexTaxonomyProposal.filter(x=>x.status==="Keep existing").length,1);
 assert.equal(apexTaxonomyCategoryNames.length,8);
 assert.equal(assigned.category,"GetSwole");
 const csv=read("docs/catalog/APEX_TAXONOMY_MAPPING_20261102.csv");
 const lines=csv.trim().split("\n");
 assert.equal(lines.length-1,63);
 for(const line of lines.slice(1)){
  const cols=[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)]
   .map(x=>x[1].replaceAll('""','"'));
  assert.equal(cols.length,9);
  const item=apexTaxonomyProposal.find(x=>x.id===cols[0]);
  assert.ok(item,"missing product ID "+cols[0]);
  assert.equal(cols[1],apexTaxonomyStoreId);
  assert.equal(item.sku,cols[2]);
  assert.equal(item.name,cols[3]);
  assert.equal(item.category??"",cols[5]);
  assert.equal(item.status,cols[6]);
  assert.equal(item.note,cols[7]);
 }
});
test("eight absent categories block staging; held products cannot be auto-assigned",()=>{
 const summary=assessReviewedTaxonomy(
  stored(),apexTaxonomyProposal,[{id:GETSWOLE,name:"GetSwole"}],
  apexTaxonomyStoreId,apexTaxonomyStoreId);
 assert.equal(summary.ready,false);
 assert.equal(summary.missingCategories.length,8);
 assert.equal(summary.held,13);
 assert.equal(summary.proposals,50);
 assert.equal(summary.alreadyAssigned,1);
 assert.match(summary.error,/Create the missing categories/);
 const staged=stageReviewedTaxonomy(stored(),summary);
 assert.equal(staged.ok,false);
 assert.equal(staged.changedKeys.length,0);
});
test("reviewed categories stage precisely 49 blank categories and nothing else",()=>{
 const rows=stored();
 const original=structuredClone(rows);
 const summary=assessReviewedTaxonomy(
  rows,apexTaxonomyProposal,allCategories(),
  apexTaxonomyStoreId,apexTaxonomyStoreId);
 assert.equal(summary.ready,true);
 assert.equal(summary.changes.length,49);
 assert.equal(summary.held,13);
 assert.equal(summary.alreadyAssigned,1);
 const staged=stageReviewedTaxonomy(rows,summary);
 assert.equal(staged.ok,true);
 assert.equal(staged.changedKeys.length,49);
 assert.deepEqual(rows,original,"No input records mutated before save");
 for(let i=0;i<63;i++){
  const source=apexTaxonomyProposal[i];
  const before=rows[i],after=staged.rows[i];
  for(const prop of ["name","sku","price","comparePrice","sourceCost",
    "description","isActive","id"])
   assert.equal(after[prop],before[prop],prop+" for "+source.name);
  if(source.category===null||source.status==="Keep existing"){
   assert.strictEqual(after,before,"Existing or held row modified: "+source.name);
  }else{
   assert.equal(after.categoryId,allCategories()
    .find(c=>c.name===source.category).id);
   assert.equal(after.needsSave,true);
  }
 }
 assert.equal(staged.rows.filter(x=>x.isActive).length,1);
});
test("stale titles, changed SKUs and existing conflicting category block entire plan",()=>{
 for(const field of ["name","sku"]){
  const rows=stored();rows[10]={...rows[10],[field]:"Changed"};
  const summary=assessReviewedTaxonomy(
   rows,apexTaxonomyProposal,allCategories(),
   apexTaxonomyStoreId,apexTaxonomyStoreId);
  assert.equal(summary.ready,false);
  assert.equal(summary.unmatched.length,1);
  assert.equal(stageReviewedTaxonomy(rows,summary).ok,false);
 }
 const conflict=stored(),target=conflict.find(x=>
  apexTaxonomyProposal.some(p=>p.id===x.id&&p.status==="Suggested"&&p.category!=="GetSwole"));
 target.categoryId=GETSWOLE;
 const summary=assessReviewedTaxonomy(
  conflict,apexTaxonomyProposal,allCategories(),
  apexTaxonomyStoreId,apexTaxonomyStoreId);
 assert.equal(summary.ready,false);
 assert.equal(summary.conflicts.length,1);
 assert.equal(stageReviewedTaxonomy(conflict,summary).ok,false);
 const other=assessReviewedTaxonomy(stored(),apexTaxonomyProposal,allCategories(),
  "62000000-0000-0000-0000-000000000001",apexTaxonomyStoreId);
 assert.equal(other.ready,false);
});
test("post-review identity or category changes abort local staging",()=>{
 const rows=stored(),summary=assessReviewedTaxonomy(
  rows,apexTaxonomyProposal,allCategories(),
  apexTaxonomyStoreId,apexTaxonomyStoreId);
 assert.equal(summary.ready,true);
 const target=summary.changes[0];
 rows.find(x=>x.key===target.key).categoryId=GETSWOLE;
 const staged=stageReviewedTaxonomy(rows,summary);
 assert.equal(staged.ok,false);
 assert.equal(staged.changedKeys.length,0);
});
test("admin action uses only authenticated and audited existing category RPC",()=>{
 const actions=read("src/app/admin/categories/actions.ts");
 const admin=read("src/app/admin/categories/page.tsx");
 const form=read("src/app/admin/categories/reviewed-taxonomy-form.tsx");
 assert.match(actions,/createReviewedTaxonomyCategories/);
 assert.match(actions,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(actions,/storeId!==apexTaxonomyStoreId/);
 assert.match(actions,/get_admin_category_publication_overview/);
 assert.match(actions,/create_admin_catalog_category/);
 assert.match(actions,/result\.data\?\.is_published!==false/);
 assert.match(admin,/ReviewedTaxonomyCategoryForm/);
 assert.match(form,/Create /);
 assert.match(form,/missing\.length===0/);
 const newAction=actions.slice(actions.indexOf("export async function createReviewedTaxonomyCategories("));
 assert.doesNotMatch(newAction+form,/\.from\("categories"\)\.insert|\.update\(|\.upsert\(|set_admin_category_publication|set_supplier_listing_intent/);
});
test("only authenticated supplier editor receives exact, staged category proposal",()=>{
 const page=read("src/app/supplier/catalog/bulk/page.tsx");
 const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
 assert.match(page,/memberships/);
 assert.match(page,/store\.id===apexTaxonomyStoreId\?apexTaxonomyProposal:undefined/);
 assert.match(page,/taxonomyStoreId=\{apexTaxonomyStoreId\}/);
 assert.match(editor,/assessReviewedTaxonomy\(rows,taxonomyProposal,categories,storeId,taxonomyStoreId\)/);
 assert.match(editor,/stageReviewedTaxonomy\(rows,taxonomyReview\)/);
 assert.match(editor,/setSelected\(staged\.changedKeys\)/);
 assert.match(editor,/Save selected/);
 assert.match(editor,/flagged for separate review/);
 assert.doesNotMatch(editor,/\.from\("products"\)\.update|\.insert\(|set_supplier_listing_intent|publishTaxonomy/);
});
