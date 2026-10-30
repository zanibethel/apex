import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const file=path=>readFileSync(path,"utf8");
const migration=file("database/sql/apex_candidate_draft_promotion.sql");
const action=file("src/app/supplier/imports/actions.ts");
const page=file("src/app/supplier/imports/page.tsx");
const form=file("src/app/supplier/imports/promote-form.tsx");

test("reviewed-to-draft operation runs as invoker with the same-store member permissions",()=>{
  assert.match(migration,/security invoker set search_path = ''/i);
  assert.match(migration,/m\.user_id=\(select auth\.uid\(\)\)/);
  assert.match(migration,/m\.role in \('owner','manager'\)/);
  assert.match(migration,/s\.is_public=false/);
  assert.match(migration,/review_status='approved_for_draft'/);
  assert.match(migration,/revoke all on function public\.create_draft_from_supplier_candidate/);
  assert.match(migration,/grant execute on function public\.create_draft_from_supplier_candidate.*to authenticated/);
  assert.doesNotMatch(migration,/security definer/i);
});

test("draft creation is atomic and has a one-to-one source link",()=>{
  assert.match(migration,/candidate_id uuid primary key/);
  assert.match(migration,/product_id uuid not null unique/);
  assert.match(migration,/foreign key \(store_id,candidate_id\)/);
  assert.match(migration,/foreign key \(store_id,product_id\)/);
  assert.match(migration,/insert into public\.products/);
  assert.match(migration,/insert into public\.inventory_items/);
  assert.match(migration,/insert into public\.supplier_candidate_drafts/);
  assert.doesNotMatch(migration,/insert into public\.supplier_sales_history|sendToAddress|transferBTC/);
});

test("supplier action accepts price and stock separately from source cost",()=>{
  assert.match(action,/APEX_DRAFT_CATALOG_WRITES_ENABLED/);
  assert.match(action,/getSupplierWorkspace/);
  assert.match(action,/retailPrice/);
  assert.match(action,/confirmedStock/);
  assert.match(action,/confirmedPrice!=="on"/);
  assert.match(action,/stockVerified!=="on"/);
  assert.match(action,/\.rpc\("create_draft_from_supplier_candidate"/);
  assert.match(action,/p_retail_price_cents:retailCents/);
  assert.match(action,/p_quantity_on_hand:quantity/);
  assert.doesNotMatch(action,/wholesale_cost_cents|service_role|auth\.admin|is_published:true/);
});

test("import page offers conversion only for approved unlinked candidates",()=>{
  assert.match(page,/supplier_candidate_drafts/);
  assert.match(page,/mappings\.error/);
  assert.match(page,/linked\.has\(item\.id\)/);
  assert.match(page,/item\.review_status==="approved_for_draft"/);
  assert.match(page,/PromoteReviewedVariantForm/);
  assert.match(form,/type="checkbox" name="confirmedPrice" required/);
  assert.match(form,/type="checkbox" name="stockVerified"/);
  assert.match(form,/does not publish/);
});
