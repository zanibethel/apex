import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import test from "node:test";

const source=readFileSync("src/app/supplier/catalog/image-actions.ts","utf8");

// Test the literal expressions deployed to Next.js, rather than reimplementing
// their shape in a test-only helper that might accidentally diverge.
function sourceRegexp(name) {
  const line=source.split("\n").find(item=>item.startsWith("const "+name+"="));
  assert.ok(line,"missing "+name+" regular expression");
  const value=line.slice(line.indexOf("=")+1).replace(/;$/,"");
  assert.ok(value.startsWith("/"),"expected inline RegExp literal");
  const closing=value.lastIndexOf("/");
  return new RegExp(value.slice(1,closing),value.slice(closing+1));
}

const idRe=sourceRegexp("idRe");
const imageFileRe=sourceRegexp("imageFileRe");

test("full Supabase UUIDs pass the store/product permission preflight",()=>{
  // The original broken expression stopped at the fourth UUID group.
  // This is the direct cause of 'Product upload permission required.'
  for(let i=0;i<10;i++) assert.equal(idRe.test(randomUUID()),true);
  assert.equal(idRe.test("019ac3c5-7053-7f43-a12b-4578934b6200"),true);
  assert.equal(idRe.test("019AC3C5-7053-7F43-A12B-4578934B6200"),true);
});
test("truncated and malformed IDs cannot bypass permission preflight",()=>{
  const uuid=randomUUID();
  for(const invalid of [
    uuid.slice(0,-13), // old regex's truncated 8-4-4-4 shape
    uuid.slice(0,-1),
    uuid+"-extra",
    "../"+uuid,
    uuid+"/other",
    "00000000-0000-4000-0000-000000000000", // non-RFC variant
    "",
  ])assert.equal(idRe.test(invalid),false,invalid);
});
test("only complete lower-case randomized PNG/JPG/WebP image object filenames are accepted",()=>{
  const uuid=randomUUID();
  for(const extension of ["png","jpg","webp"]) {
    assert.equal(imageFileRe.test(uuid+"."+extension),true);
  }
  for(const filename of [
    uuid.slice(0,-13)+".png",
    uuid.slice(0,-1)+".png",
    uuid+".svg",
    uuid+".png.exe",
    "../"+uuid+".png",
    uuid.toUpperCase()+".png",
    "not-a-uuid.png",
  ])assert.equal(imageFileRe.test(filename),false,filename);
});
test("upload and attachment keep private store membership, draft status and object checks",()=>{
  assert.match(source,/!idRe\.test\(storeId\)\|\|!idRe\.test\(productId\)/);
  assert.match(source,/w\.memberships\.some\(/);
  assert.match(source,/owner/);
  assert.match(source,/manager/);
  assert.match(source,/!s\.is_public/);
  assert.match(source,/\.eq\("is_published",false\)/);
  assert.match(source,/createSignedUploadUrl\(path\)/);
  assert.match(source,/!path\.startsWith\(prefix\)\|\|!imageFileRe\.test\(path\.slice\(prefix\.length\)\)/);
  assert.match(source,/\.list\(folder/);
  assert.match(source,/\.update\(\{image_path:path\}\)/);
  assert.match(source,/APEX_DRAFT_CATALOG_WRITES_ENABLED/);
  assert.doesNotMatch(source,/service_role|auth\.admin|upsert:true/);
});
