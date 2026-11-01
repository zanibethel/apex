import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 SAVED_PREVIEW_PAGE_SIZE,parseSavedPreviewPage,savedPreviewWindow,
 savedPreviewPageHref
} from "../src/lib/catalog/saved-offer-preview-pages.mjs";

const preview=readFileSync("src/app/supplier/catalog/bulk/preview/page.tsx","utf8");
const panel=readFileSync("src/app/supplier/catalog/bulk-publish-panel.tsx","utf8");
const css=readFileSync("src/app/globals.css","utf8");

test("preview all saved pages cover 250 private products in 5 disjoint 50-row windows",()=>{
 assert.equal(SAVED_PREVIEW_PAGE_SIZE,50);
 const windows=Array.from({length:5},(_,i)=>savedPreviewWindow(i+1,250));
 assert.deepEqual(windows.map(p=>[p.offset,p.end,p.first,p.last,p.pages,p.previous,p.next]),[
  [0,49,1,50,5,null,2],
  [50,99,51,100,5,1,3],
  [100,149,101,150,5,2,4],
  [150,199,151,200,5,3,5],
  [200,249,201,250,5,4,null],
 ]);
 const ids=new Set(windows.flatMap(p=>Array.from({length:p.last-p.first+1},(_,i)=>p.first+i)));
 assert.equal(ids.size,250);
 assert.equal(savedPreviewWindow(6,250),null);
});

test("empty, partial and out-of-range preview pages fail closed",()=>{
 assert.deepEqual(savedPreviewWindow(1,0),{
  page:1,pages:1,total:0,offset:0,end:49,first:0,last:0,previous:null,next:null,
 });
 assert.equal(savedPreviewWindow(2,0),null);
 assert.equal(savedPreviewWindow(2,51)?.last,51);
 assert.equal(savedPreviewWindow(3,51),null);
 assert.equal(savedPreviewWindow(0,251),null);
 assert.equal(savedPreviewWindow(1,null),null);
 assert.equal(savedPreviewWindow(1,Number.NaN),null);
 assert.equal(parseSavedPreviewPage(undefined),1);
 for(const raw of ["0","-1","1.2","01","foo","1001","999999","","2&all=0",null,["2"]]){
  assert.equal(parseSavedPreviewPage(raw),null,String(raw));
 }
 assert.equal(parseSavedPreviewPage("5"),5);
 assert.equal(savedPreviewPageHref(5),"/supplier/catalog/bulk/preview?all=1&page=5");
 assert.equal(savedPreviewPageHref(0),null);
});

test("authenticated private preview gets exact server count and stable ordered pages",()=>{
 assert.match(preview,/auth\.getUser\(\)/);
 assert.match(preview,/\.in\("role",\["owner","manager"\]\)/);
 assert.match(preview,/\.eq\("is_public",false\)/);
 assert.match(preview,/\.eq\("store_id",store\.id\)\.eq\("is_published",false\)/);
 assert.match(preview,/\{count:"exact"\}/);
 assert.match(preview,/\.order\("name"\)\.order\("id"\)/);
 assert.match(preview,/\.range\(\(page-1\)\*SAVED_PREVIEW_PAGE_SIZE,page\*SAVED_PREVIEW_PAGE_SIZE-1\)/);
 assert.match(preview,/savedPreviewWindow\(page,productCount\)/);
 assert.match(preview,/if\(showAll&&\(!paging\|\|\(paging\.total>0&&!products\?\.length\)\)\)notFound\(\)/);
 assert.match(preview,/savedPreviewPageHref\(paging\.previous\)/);
 assert.match(preview,/savedPreviewPageHref\(paging\.next\)/);
 assert.doesNotMatch(preview,/Showing the first 50 saved products/);
});

test("selected preview remains bounded independently of paged Preview all",()=>{
 assert.match(preview,/requestedIds\.length>50/);
 assert.match(preview,/products\.length!==requestedIds\.length/);
 assert.match(preview,/\.in\("id",requestedIds\)/);
 assert.match(preview,/\.limit\(SAVED_PREVIEW_PAGE_SIZE\)/);
 assert.match(preview,/get_private_release_readiness/);
 assert.match(preview,/createSignedUrl\(p\.image_path,90\)/);
 assert.match(preview,/robots:\{index:false,follow:false\}/);
 assert.doesNotMatch(preview,/createPublicUrl|service_role|is_public:true|publish_storefront/);
});

test("Publish all on paged preview never means all catalog or bypasses 50-item gate",()=>{
 assert.match(preview,/pageScoped=\{showAll\}/);
 assert.match(panel,/pageScoped=false/);
 assert.match(panel,/Publish all on this page/);
 assert.match(panel,/const limit=50/);
 assert.match(panel,/chosen\.length>limit/);
 assert.match(panel,/allEligible\.length>limit/);
 assert.match(panel,/saveBulkPublicationRequests/);
 assert.match(css,/\.apex-bulk-preview-pagination-actions \.button\{min-height:44px\}/);
 assert.doesNotMatch(panel,/\.update\(\{is_published|service_role/);
});
