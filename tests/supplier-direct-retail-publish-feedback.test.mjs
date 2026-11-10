import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {supplierPublishBlocker,supplierPublishRpcError} from "../src/lib/catalog/supplier-publish-feedback.mjs";
const read=p=>readFileSync(p,"utf8");
const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
const page=read("src/app/supplier/catalog/bulk/page.tsx");
const css=read("src/app/supplier/catalog/bulk/publish-feedback.css");
const actions=read("src/app/supplier/catalog/bulk-actions.ts");
const row={id:"p1",name:"Demo Cotton T-Shirt",needsSave:false,linkedSource:false};
const status={canRequest:true,retailShowcase:true,kind:"private",requested:false,missing:[],reviewStatus:"draft"};

test("direct retail publish is available with only required saved details, no internal review",()=>{
 assert.equal(supplierPublishBlocker({row,status,ready:true}),null);
 assert.match(page,/retailSetupComplete=isRetail&&retailMinimum\.ready/);
 assert.match(editor,/listingStatus\?\.retailShowcase!==true&&listingStatus\?\.reviewStatusAvailable/);
 assert.match(editor,/\?await saveBulkPublicationRequests/);
 assert.match(actions,/set_supplier_listing_intent/);
 assert.doesNotMatch(editor,/update public\.products|is_published:true|createInvoice/);
});
test("tap reports precise next steps rather than disabling a switch without feedback",()=>{
 assert.match(editor,/role="switch" aria-label=\{"Publish "/);
 assert.match(editor,/onChange=\{e=>attemptCardPublish\(r,listingStatus,publishReady,e\.target\.checked\)\}/);
 assert.match(editor,/aria-describedby=\{cardFeedback\?/);
 assert.match(editor,/role="status"/);
 assert.match(css,/data-can-publish="true"/);
 assert.match(css,/\.apex-card-publish-error/);
 assert.equal(supplierPublishBlocker({row:{...row,id:undefined},status,ready:false}),"Save this new product before turning on Publish.");
 assert.match(supplierPublishBlocker({row:{...row,needsSave:true},status,ready:false}),/Save the product edits first/);
 assert.match(supplierPublishBlocker({row,status:{...status,missing:["Product description"]},ready:false}),/Product description/);
 assert.match(supplierPublishBlocker({row,status:{...status,kind:"hold",reason:"Admin lock"},ready:false}),/Admin lock/);
 assert.match(supplierPublishBlocker({row,status:{...status,kind:"review"},ready:false}),/administrator must clear a review restriction/i);
 assert.match(supplierPublishBlocker({row:{...row,linkedSource:true},status,ready:false}),/linked to an older supplier intake/);
 assert.match(supplierPublishBlocker({row,status:{...status,kind:"unavailable"},ready:false}),/could not be verified/);
 assert.equal(supplierPublishBlocker({row,status:{...status,kind:"hold"},requested:true,ready:false}),null);
});
test("server maps known rejected publish causes without surfacing arbitrary database errors",()=>{
 assert.match(actions,/supplierPublishRpcError\(rpcError,action\)/);
 assert.match(supplierPublishRpcError({message:"Admin hold or review prevents listing"}),/administrator hold/i);
 assert.match(supplierPublishRpcError({message:"Only ordinary retail products are eligible for this showcase"}),/not eligible/i);
 assert.match(supplierPublishRpcError({message:"This product is on the administrator visibility restriction list"}),/restricted/i);
 assert.doesNotMatch(supplierPublishRpcError({message:"secret token: abcd"}),/abcd/);
});
test("retail photo evidence doesn't force private review; protected workflow remains for other products",()=>{
 assert.match(editor,/Image saved privately/);
 assert.match(editor,/Internal image review is not required for ordinary retail display/);
 assert.match(editor,/SupplierReviewSubmission/);
 assert.match(editor,/Admin hold/);
 assert.match(editor,/Resubmit saved corrections for review/);
});
