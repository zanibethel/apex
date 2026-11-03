import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 parseAdminCategoryStores,
} from "../src/lib/catalog/admin-category-publication.mjs";

const read=p=>readFileSync(p,"utf8");
const store={id:"62000000-0000-0000-0000-000000000001",name:"Apex private store"};
test("private category store chooser accepts only valid bounded data",()=>{
 const parsed=parseAdminCategoryStores([store]);
 assert.deepEqual(parsed,[store]);
 assert.ok(Object.isFrozen(parsed));
 assert.ok(Object.isFrozen(parsed[0]));
 assert.deepEqual(parseAdminCategoryStores([]),[]);
 for(const invalid of [
  undefined,{},[null],[{...store,id:"unknown"}],
  [{...store,name:""}],[{...store,name:4}],
  [store,store],Array.from({length:101},()=>store),
 ])
  assert.equal(parseAdminCategoryStores(invalid),null);
});
test("admin category creation is a server action with verified identity",()=>{
 const actions=read("src/app/admin/categories/actions.ts");
 const page=read("src/app/admin/categories/page.tsx");
 const form=read("src/app/admin/categories/create-category-form.tsx");
 assert.match(actions,/export async function createAdminCategory\(/);
 assert.match(actions,/createSupplierServerClient\(\)/);
 assert.match(actions,/auth\.getUser\(\)/);
 assert.match(actions,/isVerifiedPlatformAdmin\(data\.user\)/);
 assert.match(actions,/rpc\("create_admin_catalog_category"/);
 assert.match(actions,/is_published!==false/);
 assert.match(actions,/result\.error\.code==="23505"/);
 assert.match(actions,/revalidatePath\("\/supplier\/catalog\/bulk"\)/);
 assert.match(page,/rpc\("get_admin_private_category_stores"\)/);
 assert.match(page,/parseAdminCategoryStores\(storeResult\.data\)/);
 assert.match(page,/<CreateAdminCategoryForm stores=\{stores\}\/>/);
 assert.match(form,/Create category/);
 assert.match(form,/name="storeId"/);
 assert.match(form,/name="name"/);
 assert.match(form,/maxLength=\{60\}/);
 assert.match(page,/Categories start unpublished/);
 assert.ok(!["service_role","createPublicUrl",".insert(",".upsert(",".update(",".delete(","createInvoice","createPayout"].some(term=>(actions+page+form).includes(term)));
});
test("database creates unpublished category, no product edits or release bypass",()=>{
 const sql=read("supabase/migrations/20261103073000_apex_admin_category_creation.sql");
 const integration=read("tests/payout-rls/admin-category-create.sql");
 const workflow=read(".github/workflows/payout-rls.yml");
 assert.match(sql,/create function public\.create_admin_catalog_category/);
 assert.match(sql,/create function public\.get_admin_private_category_stores/);
 assert.match(sql,/app_metadata,apex_role/);
 assert.match(sql,/security definer/);
 assert.match(sql,/on conflict\(store_id,slug\) do nothing/);
 assert.match(sql,/values\(p_store_id,v_slug,v_name,false\)/);
 assert.match(sql,/Category created unpublished/);
 assert.match(sql,/check\(action in \('create','publish','unpublish'\)\)/);
 assert.match(sql,/revoke all on function public\.create_admin_catalog_category/);
 assert.match(sql,/has_table_privilege\('authenticated','public\.categories','INSERT'\)/);
 assert.match(sql,/enabled=false/);
 assert.doesNotMatch(sql,/update public\.products|update apex_internal\.private_release_gate|set is_published=true|create_invoice|wallet|payout/);
 assert.match(integration,/Supplier impersonated category creator/);
 assert.match(integration,/Duplicate slug category allowed/);
 assert.match(integration,/Category creation was not audited exactly once/);
 assert.match(integration,/Category create exposed the public catalog/);
 assert.match(workflow,/admin-category-create\.sql/);
});
