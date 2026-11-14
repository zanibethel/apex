import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
test("supplier-published retail products automatically display their saved image",()=>{
 const media=read("src/app/catalog/approved-product-media.tsx");
 const shelf=read("src/app/catalog/approved-sold-out-shelf.tsx");
 const detail=read("src/app/catalog/product/[id]/page.tsx");
 assert.match(shelf,/<ApprovedProductMedia productId=\{p\.id\} availability=\{p\.availability\} retailShowcase\/>/);
 assert.match(detail,/<ApprovedProductMedia productId=\{product\.id\} availability=\{product\.availability\} retailShowcase\/>/);
 assert.match(media,/!failed&&<Image/);
 assert.match(media,/retailShowcase\?"\/api\/catalog\/retail-media\/v1\/":/);
 assert.match(media,/onError=\{\(\)=>setFailed\(true\)\}/);
 assert.doesNotMatch(media,/!retailShowcase&&<Image/);
});
test("retail proxy keeps server-only storage and approval paths private",()=>{
 const route=read("src/app/api/catalog/retail-media/v1/[productId]/route.ts");
 assert.match(route,/const UUID=/);
 assert.match(route,/if\(!UUID\.test\(productId\)\)return unavailable\(\)/);
 assert.match(route,/\/functions\/v1\/apex-media-v1\/retail\//);
 assert.match(route,/method:"GET"/);
 assert.match(route,/cache:"no-store",redirect:"manual"/);
 assert.match(route,/status:404/);
 assert.match(route,/ALLOWED\.has\(mime\)/);
 assert.match(route,/raw\.length!==size/);
 assert.match(route,/MAX=3145728/);
 assert.doesNotMatch(route,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET|source_image_path|createSignedUrl|createPublicUrl|admin\/media-readiness/);
});
test("Edge retail media fetch is product-only and revalidates publication after private download",()=>{
 const edge=read("supabase/functions/apex-media-v1/index.ts");
 assert.match(edge,/async function getRetailImage\(req:Request,productId:string\)/);
 assert.match(edge,/service!\.rpc\("apex_retail_showcase_image_source_v1"/);
 assert.match(edge,/source_image_path/);
 assert.match(edge,/SRC_BUCKET\)\.download\(path\)/);
 assert.match(edge,/fileIsValid\(bytes,mime\)/);
 assert.match(edge,/const current=await resolve\(\)/);
 assert.match(edge,/source_image_path!==path\)return denied\(\)/);
 assert.match(edge,/Cache-Control":"private, no-store, max-age=0/);
 assert.match(edge,/suffix\[0\]==="retail"&&validId\(suffix\[1\]\)/);
 assert.match(edge,/suffix\[0\]==="asset"&&validId\(suffix\[1\]\)/);
});
test("Postgres image resolver allows only currently visible product and denies all end-user callers",()=>{
 const migration=read("supabase/migrations/20261114193500_apex_retail_showcase_published_image_source_v1.sql");
 for(const check of [
  "apex_internal.retail_showcase_gate",
  "lc.supplier_wants_listing=true","lc.admin_gate='clear'",
  "lc.republish_approval_required or lc.republish_approved",
  "p.archived_at is null and p.is_published=false and p.is_active=true",
  "apex_internal.retail_showcase_category_allowed",
  "apex_internal.retail_product_visibility_restrictions",
  "public.private_product_review_states",
  "public.supplier_candidate_drafts",
  "apex_internal.listing_identity_holds",
  "source_image_path",
  "to service_role",
  "from public,anon,authenticated",
 ])assert.ok(migration.includes(check),check);
 assert.doesNotMatch(migration,/\bupdate\b\s+(public\.products|apex_internal\.retail_order_engine_gate)|\bcreateInvoice\b/);
 const sql=read("tests/retail-visibility-migrations/auto-published-media.sql");
 for(const marker of [
  "has_function_privilege('anon'",
  "has_function_privilege('authenticated'",
  "has_function_privilege('service_role'",
  "Unpublished cross-store image was exposed",
  "Held listing image was exposed",
  "Image replacement did not update public media pointer",
  "Unpublished private image was exposed",
  "Held content review did not protect image",
  "Foreign store private image path was exposed",
  "Global showcase gate did not revoke image",
 ])assert.ok(sql.includes(marker),marker);
 const ci=read(".github/workflows/retail-visibility-migrations.yml");
 assert.match(ci,/auto-published-media\.sql/);
 assert.match(ci,/apex_retail_showcase_published_image_source_v1\.sql/);
});
