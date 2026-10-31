import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {privateBulkReadiness} from "../src/lib/catalog/private-bulk-readiness.mjs";

const saved={id:"saved",name:"Synthetic product",needsSave:false};
const base={canRequest:true,kind:"private",requested:false,missing:[],status:"Not requested"};
const source=readFileSync("src/app/supplier/catalog/bulk-editor.tsx","utf8");
const page=readFileSync("src/app/supplier/catalog/bulk/page.tsx","utf8");
const css=readFileSync("src/app/globals.css","utf8");

test("new or edited drafts never show stale ready/requested status",()=>{
 const fresh=privateBulkReadiness({name:"New",needsSave:true},base);
 assert.equal(fresh.kind,"unsaved");
 assert.match(fresh.label,/not saved/);
 const edited=privateBulkReadiness({...saved,needsSave:true},{...base,kind:"requested",requested:true});
 assert.equal(edited.kind,"unsaved");
 assert.match(edited.description,/Save/);
});
test("unavailable or missing listing control fails closed even when setup is complete",()=>{
 assert.equal(privateBulkReadiness(saved,undefined).kind,"unavailable");
 assert.equal(privateBulkReadiness(saved,{...base,kind:"unavailable"}).kind,"unavailable");
 const fallback=privateBulkReadiness(saved,{...base,canRequest:false});
 assert.equal(fallback.kind,"unavailable");
});
test("admin hold and review override supplier request, including local request acknowledgement",()=>{
 const hold=privateBulkReadiness(saved,{...base,kind:"hold",requested:true},true);
 assert.equal(hold.kind,"hold");
 assert.match(hold.description,/administrator/i);
 const review=privateBulkReadiness(saved,{...base,kind:"review",requested:true},true);
 assert.equal(review.kind,"review");
 assert.match(review.description,/administrator/i);
});
test("requested is private, not published, and a local successful request is reflected",()=>{
 const record=privateBulkReadiness(saved,{...base,requested:true});
 assert.equal(record.kind,"requested");
 assert.match(record.description,/not publicly listed/);
 assert.equal(privateBulkReadiness(saved,base,true).kind,"requested");
});
test("setup shows exactly the missing draft fields, clamping count conservatively",()=>{
 const incomplete=privateBulkReadiness(saved,{...base,missing:["Product category","Saved product image","Confirmed stock on hand"],canRequest:false});
 assert.equal(incomplete.kind,"setup");
 assert.equal(incomplete.label,"Draft setup 5/8");
 assert.deepEqual(incomplete.missing,["Product category","Saved product image","Confirmed stock on hand"]);
 assert.equal(incomplete.completed,5);
 assert.equal(incomplete.total,8);
 const malformed=privateBulkReadiness(saved,{...base,missing:["",null,"Unique SKU"]});
 assert.deepEqual(malformed.missing,["Unique SKU"]);
});
test("complete private draft can request but never implies public sale approval",()=>{
 const state=privateBulkReadiness(saved,base);
 assert.equal(state.kind,"ready");
 assert.match(state.label,/private/);
 assert.match(state.description,/not approval for public sales/);
});
test("supplier cards render status and collapsed next steps from server-derived gates",()=>{
 assert.match(page,/kind:listingError\?"unavailable":status\.kind/);
 assert.match(source,/privateBulkReadiness\(r,listingStatus,Boolean\(publication\?\.ok\)\)/);
 assert.match(source,/className="apex-bulk-readiness-details"/);
 assert.match(source,/readiness\.missing\.map/);
 assert.match(source,/readiness\.description/);
 assert.match(css,/\.apex-bulk-readiness-details summary:focus-visible/);
 assert.doesNotMatch(source,/createPublicUrl|service_role|is_published:true|is_public:true/);
});
