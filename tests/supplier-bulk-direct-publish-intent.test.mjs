import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {eligiblePrivatePublishIds} from "../src/lib/catalog/bulk-publish-selection.mjs";
const read=p=>readFileSync(p,"utf8");
const page=read("src/app/supplier/catalog/bulk/page.tsx");
const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
const tile=read("src/app/supplier/catalog/bulk-inline-offer.tsx");
const actions=read("src/app/supplier/catalog/bulk-actions.ts");
const css=read("src/app/globals.css");

test("only saved eligible authorized UI rows qualify for quick publication",()=>{
 const rows=[
  {id:"saved-eligible",needsSave:false},
  {id:"saved-admin-hold",needsSave:false},
  {id:"already-requested",needsSave:false},
  {id:"needs-detail",needsSave:false},
  {id:"saved-but-edited",needsSave:true},
  {needsSave:true},
 ];
 const statuses=[
  {productId:"saved-eligible",canRequest:true,requested:false},
  {productId:"saved-admin-hold",canRequest:false,requested:false},
  {productId:"already-requested",canRequest:true,requested:true},
  {productId:"needs-detail",canRequest:false,requested:false},
  {productId:"saved-but-edited",canRequest:true,requested:false},
 ];
 assert.deepEqual(eligiblePrivatePublishIds(rows,statuses),["saved-eligible"]);
 assert.deepEqual(eligiblePrivatePublishIds(rows,statuses,new Set(["saved-eligible"])),[]);
 assert.deepEqual(eligiblePrivatePublishIds([{id:"no-check"}],[]),[]);
});

test("bulk page computes server-side draft completeness and prevents admin hold requests",()=>{
 assert.match(page,/from ".*draft-content-checklist\.mjs"/);
 assert.match(page,/from ".*listing-control\.mjs"/);
 assert.match(page,/client\.from\("supplier_listing_controls"\)/);
 assert.match(page,/\.eq\("store_id",store\.id\)\.limit\(250\)/);
 assert.match(page,/draftSetupSteps\(p,quantities\.get\(p\.id\)\)/);
 assert.match(page,/status\.canRequest&&!control\?\.supplier_wants_listing/);
 assert.match(page,/!listingError&&setup\.setupComplete/);
 assert.match(page,/listing=\{listing\}/);
});

test("saved tile has a real single Publish action, while unsaved cards cannot request",()=>{
 assert.match(tile,/saved\s*\?<div className="apex-bulk-inline-publish-actions">/);
 assert.match(tile,/onClick=\{onPublish\}/);
 assert.match(tile,/disabled=\{!canPublish\|\|requested\|\|publishing\|\|!onPublish\}/);
 assert.match(tile,/Publish/);
 assert.match(tile,/Publication requested/);
 assert.match(tile,/Select this row and choose Save selected to continue/);
 assert.match(tile,/Full preview/);
 assert.match(tile,/publicationMessage&&<p role="status"/);
});

test("bulk actions publish selected or all eligible with a bounded database request",()=>{
 assert.match(editor,/eligiblePrivatePublishIds\(rows,listing,newlyRequested\)/);
 assert.match(editor,/eligibleSelectedIds/);
 assert.match(editor,/publish\(eligibleSelectedIds\)/);
 assert.match(editor,/publish\(eligiblePublishIds\)/);
 assert.match(editor,/Publish selected/);
 assert.match(editor,/Publish all eligible/);
 assert.match(editor,/ids\.length>publicationLimit/);
 assert.match(editor,/new Set\(ids\)\.size!==ids\.length/);
 assert.match(editor,/saveBulkPublicationRequests/);
 assert.match(actions,/\.rpc\("set_supplier_listing_intent"/);
 assert.match(actions,/p_action:"publish"/);
 assert.match(actions,/ids\.length>50/);
 assert.match(actions,/\.eq\("store_id",storeId\)\.in\("id",ids\)/);
 assert.match(actions,/Public release remains disabled/);
 assert.doesNotMatch(editor+tile,/\.update\(\{is_published|\.update\(\{is_public|createPublicUrl|service_role/);
});

test("per-product publish status is displayed and all controls are touch friendly",()=>{
 assert.match(editor,/publicationById/);
 assert.match(editor,/setPublishResults/);
 assert.match(editor,/publication\?\.message/);
 assert.match(editor,/listingStatus\?\.missing\.length/);
 assert.match(editor,/Administrative holds remain enforced/);
 assert.match(css,/\.apex-bulk-inline-publish-actions/);
 assert.match(css,/@media\(max-width:500px\)/);
 assert.match(css,/\.apex-bulk-footer>button/);
});
