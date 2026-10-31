#!/usr/bin/env node
// Real Supabase Storage HTTP smoke test. Run ONLY against an isolated Apex
// development branch with an explicitly confirmed branch ref. Never production.
// Uses synthetic supplier users and a tiny inert PNG; no commerce or real data.
import assert from "node:assert/strict";
import {randomBytes, randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {assertIsolatedApexTarget} from "./isolated-apex-target.mjs";

const BUCKET = "apex-draft-product-images";
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/px8AAAAASUVORK5CYII=",
  "base64",
);

function requireResult(response,label) {
  if (response.error) {
    const code = response.error.code ? " (" + response.error.code + ")" : "";
    throw Error(label + " failed" + code);
  }
  return response.data;
}
function assertDenied(response,label) {
  // Row-level permission denials may yield either an error or an empty result.
  assert.ok(response.error || !response.data || response.data.length === 0,
    label + " was unexpectedly allowed");
}
function sdk(url,key) {
  return createClient(url,key,{
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},
  });
}

async function main() {
  // Preflight refuses even API reads for a production/misidentified target.
  const {ref,url,publishableKey,adminKey} = assertIsolatedApexTarget();
  const admin = sdk(url,adminKey);
  const bucket = requireResult(await admin.storage.getBucket(BUCKET),"bucket preflight");
  assert.equal(bucket.public,false,"draft image bucket must be private");
  assert.ok(bucket.file_size_limit <= 3145728,"bucket size limit changed");
  for (const mime of ["image/png","image/jpeg","image/webp"])
    assert.ok(bucket.allowed_mime_types.includes(mime),"bucket MIME restriction changed");

  // Fail without writes when the fresh branch has only baseline migrations.
  requireResult(await admin.from("products")
    .select("id,store_id,image_path,is_published").limit(0),"product schema preflight");
  requireResult(await admin.from("supplier_memberships")
    .select("supplier_id,user_id,role").limit(0),"membership schema preflight");
  const testId = randomUUID().slice(0,8);
  const created = {userIds:[], supplierIds:[], storeIds:[], productIds:[], imagePaths:[]};
  const passwordByRole = new Map();
  const mailByRole = new Map();

  try {
    for (const role of ["owner","manager","staff","outsider","other-owner"]) {
      // .invalid deliberately cannot deliver email; email is pre-confirmed
      // only via the isolated branch's trusted admin test client.
      const email = "apex-qa-" + testId + "-" + role + "@example.invalid";
      const password = randomBytes(30).toString("base64url") + "Aa1!";
      const data = requireResult(await admin.auth.admin.createUser({
        email,password,email_confirm:true,
      }),"synthetic user fixture");
      assert.ok(data.user?.id,"missing created user id");
      created.userIds.push(data.user.id);
      passwordByRole.set(role,password);
      mailByRole.set(role,email);
    }

    const ids = created.userIds;
    const supplierA = requireResult(await admin.from("suppliers").insert({
      slug:"apex-qa-a-" + testId,display_name:"Synthetic image QA A",
    }).select("id").single(),"supplier A fixture");
    created.supplierIds.push(supplierA.id);
    const supplierB = requireResult(await admin.from("suppliers").insert({
      slug:"apex-qa-b-" + testId,display_name:"Synthetic image QA B",
    }).select("id").single(),"supplier B fixture");
    created.supplierIds.push(supplierB.id);

    const storeA = requireResult(await admin.from("stores").insert({
      supplier_id:supplierA.id,slug:"apex-qa-a-" + testId,
      display_name:"Synthetic private test A",is_public:false,
    }).select("id").single(),"private store A fixture");
    created.storeIds.push(storeA.id);
    const storeB = requireResult(await admin.from("stores").insert({
      supplier_id:supplierB.id,slug:"apex-qa-b-" + testId,
      display_name:"Synthetic private test B",is_public:false,
    }).select("id").single(),"private store B fixture");
    created.storeIds.push(storeB.id);

    requireResult(await admin.from("supplier_memberships").insert([
      {supplier_id:supplierA.id,user_id:ids[0],role:"owner"},
      {supplier_id:supplierA.id,user_id:ids[1],role:"manager"},
      {supplier_id:supplierA.id,user_id:ids[2],role:"staff"},
      {supplier_id:supplierB.id,user_id:ids[4],role:"owner"},
    ]),"test memberships");

    const productA = requireResult(await admin.from("products").insert({
      store_id:storeA.id,sku:"QA-A-" + testId,name:"Synthetic private image fixture A",
      description:"TEST ONLY / NONTRANSACTIONAL",price_cents:100,
      currency:"USD",is_published:false,is_active:false,
    }).select("id").single(),"private draft A");
    created.productIds.push(productA.id);
    const productB = requireResult(await admin.from("products").insert({
      store_id:storeB.id,sku:"QA-B-" + testId,name:"Synthetic private image fixture B",
      description:"TEST ONLY / NONTRANSACTIONAL",price_cents:100,
      currency:"USD",is_published:false,is_active:false,
    }).select("id").single(),"private draft B");
    created.productIds.push(productB.id);

    const clients = {};
    for (const role of passwordByRole.keys()) {
      const client = sdk(url,publishableKey);
      requireResult(await client.auth.signInWithPassword({
        email:mailByRole.get(role),password:passwordByRole.get(role),
      }),"synthetic user login");
      clients[role] = client;
    }
    const anon = sdk(url,publishableKey);

    // Staff can read their own supplier draft; unaffiliated accounts cannot.
    const staffProducts = requireResult(await clients.staff.from("products")
      .select("id").eq("id",productA.id),"staff product read");
    assert.equal(staffProducts.length,1);
    const outsiderProducts = requireResult(await clients.outsider.from("products")
      .select("id").eq("id",productA.id),"outsider product read");
    assert.equal(outsiderProducts.length,0);

    const folder = storeA.id + "/" + productA.id;
    for (const role of ["owner","manager"]) {
      const path = folder + "/" + randomUUID() + ".png";
      const authorized = requireResult(
        await clients[role].storage.from(BUCKET).createSignedUploadUrl(path),
        role + " signed upload authorization",
      );
      assert.ok(authorized.token && authorized.path,
        role + " upload token not returned");
      requireResult(await clients[role].storage.from(BUCKET).uploadToSignedUrl(
        path,authorized.token,ONE_PIXEL_PNG,{contentType:"image/png",upsert:false},
      ),role + " signed upload");
      created.imagePaths.push(path);
      const listed = requireResult(await clients[role].storage.from(BUCKET)
        .list(folder,{limit:100}),role + " private object list");
      assert.ok(listed.some(obj=>obj.name===path.split("/").at(-1)),
        role + " uploaded object not visible");
      const signed = requireResult(await clients[role].storage.from(BUCKET)
        .createSignedUrl(path,60),role + " signed image read");
      assert.ok(signed.signedUrl,"signed preview missing");
      const downloaded = await fetch(signed.signedUrl);
      assert.equal(downloaded.status,200,"signed image download failed");
      assert.ok((await downloaded.arrayBuffer()).byteLength>0,
        "signed image has no content");

      // Product-path UPDATE exercises real PostgREST RLS and the check constraint.
      const saved = requireResult(await clients[role].from("products")
        .update({image_path:path}).eq("id",productA.id)
        .eq("is_published",false).select("id,image_path").maybeSingle(),
        role + " draft image attachment");
      assert.equal(saved?.image_path,path);
    }

    for (const [label,client] of [
      ["staff",clients.staff],["outsider",clients.outsider],
      ["other supplier",clients["other-owner"]],["anonymous",anon],
    ]) {
      const path = folder + "/" + randomUUID() + ".png";
      assertDenied(await client.storage.from(BUCKET)
        .createSignedUploadUrl(path),label + " unauthorized token mint");
      const listing = await client.storage.from(BUCKET).list(folder,{limit:100});
      assertDenied(listing,label + " private object listing");
      const signed = await client.storage.from(BUCKET)
        .createSignedUrl(created.imagePaths[0],60);
      assert.ok(signed.error || !signed.data?.signedUrl,
        label + " unexpectedly signed a private image");
    }

    // No untrusted authenticated user may assign a linked private draft image.
    const forbiddenUpdate = await clients.staff.from("products")
      .update({image_path:created.imagePaths[0]})
      .eq("id",productA.id).select("id");
    assertDenied(forbiddenUpdate,"staff product image write");

    console.log("PASS: real isolated Supabase Auth, Storage signed uploads, ");
    console.log("private preview reads, draft image persistence and tenant isolation.");
    console.log("Test project ref length:",ref.length);
  } finally {
    // Branch-only fixture cleanup. Branch deletion is the ultimate teardown.
    // Keep errors generic; never log tokens, keys, passwords, emails or signed URLs.
    const failures=[];
    async function cleanup(response,label) {
      if (response.error) failures.push(label);
    }
    if (created.imagePaths.length)
      await cleanup(await admin.storage.from(BUCKET).remove(created.imagePaths),"image objects");
    for (const storeId of created.storeIds)
      await cleanup(await admin.from("supplier_catalog_audit")
        .delete().eq("store_id",storeId),"catalog audit");
    for (const productId of created.productIds)
      await cleanup(await admin.from("products").delete().eq("id",productId),"products");
    for (const supplierId of created.supplierIds)
      await cleanup(await admin.from("supplier_memberships")
        .delete().eq("supplier_id",supplierId),"memberships");
    for (const storeId of created.storeIds)
      await cleanup(await admin.from("stores").delete().eq("id",storeId),"stores");
    for (const supplierId of created.supplierIds)
      await cleanup(await admin.from("suppliers").delete().eq("id",supplierId),"suppliers");
    for (const userId of created.userIds) {
      const result = await admin.auth.admin.deleteUser(userId);
      if (result.error) failures.push("synthetic auth users");
    }
    if (failures.length)
      console.error("QA cleanup needs isolated branch teardown:",[...new Set(failures)].join(", "));
  }
}

main().catch(error=>{
  // Report only authored label, not underlying SDK request or credentials.
  console.error("FAIL: isolated Supabase image test:",error.message);
  process.exitCode=1;
});
