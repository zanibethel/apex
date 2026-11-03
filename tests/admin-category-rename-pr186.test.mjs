import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const actions=read("src/app/admin/categories/actions.ts");
const page=read("src/app/admin/categories/page.tsx");
const form=read("src/app/admin/categories/rename-category-form.tsx");
const migration=read("supabase/migrations/20261103132000_apex_admin_category_rename.sql");
const integration=read("tests/payout-rls/admin-category-rename.sql");
const workflow=read(".github/workflows/payout-rls.yml");

test("only verified admin can rename a category with stale-label protection",()=>{
 assert.match(actions,/export async function renameAdminCategory\(/);
 assert.match(actions,/isVerifiedPlatformAdmin\(auth.user\)/);
 assert.match(actions,/rename_admin_catalog_category/);
 assert.match(actions,/p_expected_name:expectedName/);
 assert.match(actions,/p_new_name:newName/);
 assert.match(actions,/result\.data\.is_published!==false/);
 assert.match(actions,/revalidatePath\("\/supplier\/catalog\/bulk"\)/);
 assert.doesNotMatch(actions,/service_role|\.update\(|\.insert\(/);
});
test("existing admin cards edit names and do not re-create renamed taxonomy names",()=>{
 assert.match(page,/RenameAdminCategoryForm/);
 assert.match(page,/currentName=\{c.categoryName\}/);
 assert.match(page,/categories.filter\(c=>c.storeId===apexTaxonomyStoreId\).length<apexTaxonomyCategoryNames.length/);
 assert.match(form,/defaultValue=\{currentName\}/);
 assert.match(form,/name="expectedName"/);
 assert.match(form,/name="newName"/);
 assert.match(form,/disabled=\{published\|\|pending\}/);
 assert.match(form,/Unpublish this category before renaming/);
});
test("rename RPC keeps category id and products, logs verified admin and remains unreleased",()=>{
 assert.match(migration,/create function public\.rename_admin_catalog_category/);
 assert.match(migration,/security definer/);
 assert.match(migration,/app_metadata,apex_role/);
 assert.match(migration,/v_category\.is_published then raise exception/);
 assert.match(migration,/v_category\.name is distinct from p_expected_name/);
 assert.match(migration,/set name=v_name,slug=v_slug/);
 assert.match(migration,/'rename'/);
 assert.match(migration,/actor_id\)/);
 assert.match(migration,/invalidate_private_review/);
 assert.match(migration,/revoke all on function public\.rename_admin_catalog_category/);
 assert.match(migration,/grant execute on function public\.rename_admin_catalog_category/);
 assert.doesNotMatch(migration,/update public\.products|update apex_internal\.private_release_gate|create_invoice|create_payout/);
 assert.match(integration,/Supplier impersonated category rename/);
 assert.match(integration,/Published category rename allowed/);
 assert.match(integration,/Category rename exposed public products/);
 assert.match(workflow,/admin-category-rename\.sql/);
});
