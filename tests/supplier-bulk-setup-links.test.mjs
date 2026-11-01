import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bulkSetupTarget,bulkSetupHref} from "../src/lib/catalog/bulk-setup-targets.mjs";
import {draftSetupSteps} from "../src/lib/catalog/draft-content-checklist.mjs";

const editor=readFileSync("src/app/supplier/catalog/bulk-editor.tsx","utf8");
const css=readFileSync("src/app/globals.css","utf8");
const validKey="40000000-0000-4000-8000-000000000001";

test("every server-side private checklist label has a matching same-card target",()=>{
 const fields=draftSetupSteps({
  name:"",sku:"",description:"",category_id:null,image_path:null,
  price_cents:0,is_active:false,
 },undefined).steps;
 assert.equal(fields.length,8);
 const expected={
  "Product name":"name",
  "Unique SKU":"sku",
  "Product description":"description",
  "Product category":"category",
  "Saved product image":"media",
  "Purchase price":"price",
  "Active in internal catalog":"active",
  "Confirmed stock on hand":"media",
 };
 for(const step of fields){
  assert.ok(step.label in expected,step.label);
  assert.equal(bulkSetupTarget(step.label,validKey),"bulk-fix-"+validKey+"-"+expected[step.label]);
  assert.equal(bulkSetupHref(step.label,validKey),"#bulk-fix-"+validKey+"-"+expected[step.label]);
 }
});
test("unknown fields and invalid keys get no fragment links",()=>{
 assert.equal(bulkSetupHref("Arbitrary admin instruction",validKey),null);
 assert.equal(bulkSetupHref("Product name","abc#other"),null);
 assert.equal(bulkSetupHref("Product name","../../admin"),null);
 assert.equal(bulkSetupHref("Unique SKU",""),null);
 assert.equal(bulkSetupHref("Saved product image",null),null);
});
test("targets point to matching editor controls and private image/stock section",()=>{
 for(const suffix of ["name","sku","price","category","active","description"]){
  assert.ok(editor.includes('id={"bulk-fix-"+r.key+"-'+suffix+'"}'),suffix);
 }
 assert.ok(editor.includes('id={"bulk-fix-"+r.key+"-media"}'));
 assert.ok(editor.includes('className="apex-bulk-media-target"'));
 assert.ok(editor.includes("bulkSetupHref(item,r.key)"));
 assert.ok(editor.includes('className="apex-bulk-fix-link"'));
 assert.ok(editor.includes("readiness.missing.map"));
 assert.ok(css.includes(".apex-bulk-fix-link:focus-visible"));
 assert.ok(css.includes(".apex-bulk-media-target:target"));
 assert.ok(css.includes('scroll-margin-top:85px'));
});
test("client links do not mutate drafts, publish or bypass admin holds",()=>{
 const map=readFileSync("src/lib/catalog/bulk-setup-targets.mjs","utf8");
 assert.doesNotMatch(map,/https?:\/\/|fetch\(|\.rpc\(|\.from\(|service_role|is_published|is_public/);
 assert.doesNotMatch(editor,/createPublicUrl|service_role|\.update\(\{is_published/);
});
