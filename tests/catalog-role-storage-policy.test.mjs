import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const catalog=readFileSync("src/app/supplier/catalog/page.tsx","utf8");
const storage=readFileSync("database/sql/apex_private_product_images_storage.sql","utf8");
const repair=readFileSync("database/sql/apex_private_product_images_policy_repair_REVIEW_ONLY.sql","utf8");
const actions=readFileSync("src/app/supplier/operations/actions.ts","utf8");
const images=readFileSync("src/app/supplier/catalog/image-actions.ts","utf8");

test("catalog forms match server permissions for a manager or owner of that private store",()=>{
  assert.match(catalog,/APEX_DRAFT_CATALOG_WRITES_ENABLED/);
  assert.match(catalog,/stores\.length===1&&!stores\[0\]\.is_public/);
  assert.match(catalog,/member\.supplier_id===stores\[0\]\.supplier_id/);
  assert.match(catalog,/member\.role==="owner"\|\|member\.role==="manager"/);
  for(const component of ["ProductRowEditor","SourceCostEditor","ImportReviewForm","PromoteReviewedVariantForm","ProductImageUploader","NewProductForm","NewCategoryForm"]) {
    assert.match(catalog,new RegExp(component));
  }
  assert.match(actions,/\.in\("role",\["owner","manager"\]\)/);
  assert.match(actions,/\.eq\("is_public",false\)/);
});

test("private image policies reference storage object path even inside nested product query",()=>{
  assert.match(storage,/storage\.foldername\(storage\.objects\.name\)/);
  assert.match(repair,/storage\.foldername\(storage\.objects\.name\)/);
  assert.doesNotMatch(storage,/storage\.foldername\(name\)/);
  assert.doesNotMatch(repair,/storage\.foldername\(name\)/);
  assert.match(repair,/position\('storage\.foldername\(p\.name\)' in with_check\)/);
  assert.match(repair,/position\('storage\.foldername\(p\.name\)' in qual\)/);
  assert.match(repair,/raise exception 'Apex image policy definitions changed/);
  assert.match(storage,/m\.role in \('owner','manager'\)/);
  assert.match(repair,/p\.is_published=false and s\.is_public=false/);
  assert.match(images,/getSupplierWorkspace/);
  assert.match(images,/\.eq\("is_published",false\)/);
  assert.doesNotMatch(storage,/for delete|for update/i);
  assert.doesNotMatch(repair,/create policy[^;]*for delete|create policy[^;]*for update/i);
});
