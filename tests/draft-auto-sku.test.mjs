import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {generateDraftSku,normalizeSku,chooseNewSku} from "../src/lib/catalog/sku.mjs";

const read=path=>readFileSync(path,"utf8");
const id="a1b2c3d4-1234-4abc-8abc-123456789abc";

test("auto SKU includes readable product name and UUID-derived uniqueness",()=>{
 assert.equal(generateDraftSku("5-Amino-1 MQ — 5 MG",()=>id),"APX-5-AMINO-1-MQ-5-MG-A1B2C3D4");
 assert.equal(generateDraftSku("___",()=>id),"APX-PRODUCT-A1B2C3D4");
 assert.equal(generateDraftSku("Élite + Vitamin / A",()=>id),"APX-ELITE-VITAMIN-A-A1B2C3D4");
 assert.ok(generateDraftSku("X".repeat(300),()=>id).length<=60);
 assert.notEqual(generateDraftSku("test"),generateDraftSku("test"));
 assert.throws(()=>generateDraftSku("test",()=>id.slice(0,-2)),/UUID/);
});
test("blank SKU generates; manually overridden SKUs normalize and validate",()=>{
 const generated=chooseNewSku("", "5-Amino-1 MQ");
 assert.match(generated,/^APX-5-AMINO-1-MQ-[0-9A-F]{8}$/);
 assert.equal(chooseNewSku("apx-custom_20.5", "Ignored"),"APX-CUSTOM_20.5");
});
test("manual SKU handles custom, limits, and unsafe characters",()=>{
 assert.equal(normalizeSku("  apx-custom_20.5 "), "APX-CUSTOM_20.5");
 assert.equal(normalizeSku("1001"),"1001");
 for (const invalid of [""," ","-BAD","BAD SPACE","ABC/DEF","<script>","é","A".repeat(61)]) {
   assert.equal(normalizeSku(invalid),null,invalid);
 }
 assert.equal(normalizeSku("A".repeat(60)),"A".repeat(60));
 assert.equal(normalizeSku(null),null);
 assert.equal(chooseNewSku("My SKU","test"),null);
});
test("server actions generate source-derived SKU only after role checks",()=>{
 const ops=read("src/app/supplier/operations/actions.ts");
 const imports=read("src/app/supplier/imports/actions.ts");
 assert.match(ops,/chooseNewSku\(skuRaw,name\)/);
 assert.match(ops,/const sku=normalizeSku\(form\.get\("sku"\)\)/);
 assert.match(ops,/\.update\(updates\)/);
 assert.match(ops,/\.eq\("is_published",false\)/);
 assert.match(ops,/\.in\("role",\["owner","manager"\]\)/);
 assert.match(imports,/supplier_import_candidates/);
 assert.match(imports,/product_name,strength/);
 assert.match(imports,/chooseNewSku\("",/);
 assert.match(imports,/\.rpc\("create_draft_from_candidate_with_compare"/);
 assert.doesNotMatch(ops+imports,/service_role|auth\.admin|is_published:true/);
});
test("create forms default to automatic SKU but edit exposes current SKU",()=>{
 const forms=read("src/app/supplier/operations/forms.tsx");
 const importForm=read("src/app/supplier/imports/promote-form.tsx");
 const catalog=read("src/app/supplier/catalog/page.tsx");
 assert.match(forms,/placeholder="Auto-generated when blank"/);
 assert.match(importForm,/placeholder="Auto-generated when blank"/);
 assert.match(forms,/name="sku" defaultValue=\{sku\}/);
 assert.match(catalog,/sku=\{product.sku\}/);
 assert.match(catalog,/SKU: \{product.sku\}/);
 assert.doesNotMatch(forms,/id="draft-product-sku" name="sku"[^>]*\srequired/);
});
test("schema change grants only SKU column; database still owns per-store uniqueness",()=>{
 const sql=read("database/sql/apex_draft_sku_edit_REVIEW_ONLY.sql");
 assert.match(sql,/grant update \(sku\) on public.products to authenticated/i);
 assert.match(sql,/supplier_draft_products_update/);
 assert.match(sql,/relrowsecurity/);
 assert.match(sql,/store_id, sku/);
 assert.doesNotMatch(sql,/grant update \(is_published|grant update \(store_id|disable row level security/i);
});
