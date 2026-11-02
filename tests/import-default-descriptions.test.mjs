import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {IMPORT_DEFAULT_DESCRIPTION_NAMES,importDefaultDescription}
 from "../src/lib/catalog/import-default-descriptions.mjs";

const sourceNames=[
 "5-Amino-1 MQ","AHK-CU","AOD-9604","ARA-290","BPC-157","Cagrilintide",
 "CJC-1295 (with DAC)","CJC-1295 (without DAC)","CJC-1295 + Ipamorelin",
 "DSIP","Epithalon","FOX-04","GHK-CU","GHRP-6","GLOW","HCG","HGH-FRAG 176-191",
 "Hexarelin Acetate","IGF-1 LR3","Ipamorelin","Kisspeptin","KLOW",
 "KPV","LL-37","Melanotan 1","Melanotan 2","MOTS-C","NAD+","Oxytocin",
 "PEG MGF","Pinealon","PNC-27","PT-141","T3","Selank","Semax",
 "Sermorelin","SLU-PP-322","SNAP-8","SS-31","TB-500","Tesamorelin",
 "Thymalin","Thymosin Alpha 1","T2","VIP","Wolverine Blend (TB-500 + BPC-157)",
];
test("all 47 source names have individually authored neutral research descriptions",()=>{
 assert.equal(IMPORT_DEFAULT_DESCRIPTION_NAMES.length,47);
 assert.deepEqual([...IMPORT_DEFAULT_DESCRIPTION_NAMES].sort(),[...sourceNames].sort());
 for(const name of sourceNames){
  const description=importDefaultDescription(name,"10 MG");
  assert.equal(typeof description,"string");
  assert.ok(description.length<1500,name);
  assert.match(description,/Supplier-listed variant/);
  assert.match(description,/not|unverified|verification|review|confirm|verified/i);
  assert.doesNotMatch(description,/guaranteed|cures|eliminates disease|approved for all|dose daily/i);
 }
});
test("variants get distinct strength labels without inventing dose instructions",()=>{
 const a=importDefaultDescription("BPC-157","5 MG");
 const b=importDefaultDescription("BPC-157","10 MG");
 assert.notEqual(a,b);
 assert.match(a,/5 MG/);
 assert.match(b,/10 MG/);
 assert.match(importDefaultDescription("HCG","10,000 IU"),/10,000 IU/);
 assert.match(importDefaultDescription("T3","60 MG"),/strength verification/);
 assert.match(importDefaultDescription("SLU-PP-322","5 MG"),/do not assume they are identical/);
 assert.match(importDefaultDescription("FOX-04","10 MG"),/not a verified molecular identifier/);
 assert.match(importDefaultDescription("GLOW","70 MG"),/ingredients/);
 assert.match(importDefaultDescription("Wolverine Blend (TB-500 + BPC-157)","20 MG"),/mixing ratio/);
});
test("unknown, invalid or unverified names and strengths receive no fabricated scientific text",()=>{
 for(const [name,strength] of [
  ["Random Brand","10 MG"],["BPC-157",""],["BPC-157","100% pure"],
  ["BPC-157","10 MG <script>"],["","5 MG"],[null,"5 MG"],
 ]){
  assert.equal(importDefaultDescription(name,strength),null);
 }
});
test("private supplier product preview includes descriptions; approved draft form remains editable",()=>{
 const gallery=readFileSync("src/app/supplier/imports/sold-out-preview/page.tsx","utf8");
 const form=readFileSync("src/app/supplier/imports/promote-form.tsx","utf8");
 const publicCatalog=readFileSync("src/app/catalog/page.tsx","utf8");
 assert.match(gallery,/importDefaultDescription\(candidate\.product_name,candidate\.strength\)/);
 assert.match(gallery,/getSupplierWorkspace\(\)/);
 assert.match(gallery,/SOLD OUT/);
 assert.match(form,/defaultValue=\{importDefaultDescription\(productName,strength\)\?\?""\}/);
 assert.match(form,/name="description"/);
 assert.match(form,/maxLength=\{1500\}/);
 assert.match(form,/Creating a draft does not publish/);
 assert.doesNotMatch(publicCatalog,/supplier_import_candidates|importDefaultDescription/);
});
