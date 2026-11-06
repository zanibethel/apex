import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 buildSupplierSheetCards,filterProductWorkspace,productWorkspaceStatus,
} from "../src/lib/catalog/supplier-products-workspace.mjs";
import {supplierParentSnapshot} from "../src/lib/catalog/supplier-parent-review-snapshot.mjs";

const text=p=>readFileSync(p,"utf8");
const id=n=>String(n).repeat(8)+"-"+String(n).repeat(4)+"-4"+String(n).repeat(3)+
 "-8"+String(n).repeat(3)+"-"+String(n).repeat(12);
const source=(n,parent,oil,price,extra={})=>({
 id:id(n),source_row:4+n,parent_title:parent,source_name:parent,
 source_section:"Example",strength:"100 mg",size:"10 mL",carrier_oil:oil,
 retail_price_cents:price,review_status:"pending_review",review_note:"",...extra,
});
const a=source(1,"Sample One","MCT",1200);
const b=source(2,"Sample One","GSO",1400);
const held=source(3,"Sample Two","",null,{
 review_status:"needs_clarification",review_note:"Confirm source amount",
 strength:"A(100mg)/B(50mg)",
});
const formula=source(4,"Sample Blend","",6200,{
 strength:"A(100mg)/B(50mg)",
});

test("a supplier parent becomes one card with all exact variants and prices",()=>{
 const cards=buildSupplierSheetCards([a,b]);
 assert.equal(cards.length,1);
 assert.equal(cards[0].name,"Sample One");
 assert.deepEqual(cards[0].options.map(o=>o.retailPriceCents),[1200,1400]);
 assert.equal(cards[0].canApprove,true);
 assert.equal(cards[0].reviewStatus,"pending");
});
test("held parent is visible but cannot approve and has no guessed price",()=>{
 const cards=buildSupplierSheetCards([a,b,held]);
 assert.equal(cards.length,2);
 const blocked=cards.find(c=>c.name==="Sample Two");
 assert.equal(blocked.options.length,0);
 assert.equal(blocked.held.length,1);
 assert.equal(blocked.canApprove,false);
 assert.equal(blocked.held[0].reason,"Confirm source amount");
 assert.ok(!blocked.snapshotJson.includes("source_cost"));
});
test("long compositions are visible, searchable and not invented options",()=>{
 const cards=buildSupplierSheetCards([formula]);
 assert.equal(cards[0].options[0].strength,"");
 assert.equal(cards[0].compositionByVariantId[formula.id],
  "A(100mg)/B(50mg)");
 assert.equal(filterProductWorkspace(cards,"B(50mg)").length,1);
});
test("latest content decision applies only to exact current source snapshot",()=>{
 const initial=buildSupplierSheetCards([a,b]);
 const snapshot=supplierParentSnapshot([a,b]);
 const events=[{id:2,parent_title:"Sample One",decision:"approved",reviewed_snapshot:snapshot}];
 assert.equal(buildSupplierSheetCards([a,b],events)[0].reviewStatus,"approved");
 assert.equal(buildSupplierSheetCards([{...a,retail_price_cents:1500},b],events)[0].reviewStatus,"source_changed");
 assert.deepEqual(filterProductWorkspace(buildSupplierSheetCards([a,b],events),"","approved"),buildSupplierSheetCards([a,b],events));
 assert.equal(filterProductWorkspace(initial,"","approved").length,0);
});
test("saved-product statuses prioritize holds and reflect requests without claiming live",()=>{
 const draft={name:"Sample",sku:"XYZ",published:false,requested:false,adminGate:null};
 assert.equal(productWorkspaceStatus(draft),"draft");
 assert.equal(productWorkspaceStatus({...draft,requested:true}),"requested");
 assert.equal(productWorkspaceStatus({...draft,requested:true,adminGate:"hold"}),"held");
 assert.equal(productWorkspaceStatus({...draft,adminGate:"review_required"}),"held");
 assert.equal(productWorkspaceStatus({...draft,published:true}),"published");
 assert.equal(filterProductWorkspace([draft,{...draft,name:"Other",adminGate:"hold"}],"","held","saved").length,1);
});
test("malformed rows and duplicate options fail safely",()=>{
 assert.equal(buildSupplierSheetCards([a,a]),null);
 assert.equal(buildSupplierSheetCards([{...a,retail_price_cents:"bad"}]).length,1);
 const sameOption={...a,id:id(7)};
 assert.equal(buildSupplierSheetCards([a,sameOption]),null);
 assert.equal(buildSupplierSheetCards([{...a,carrier_oil:"MCT/GSO"}]),null);
});
test("supplier workspace uses existing auth, source review and direct saved product editor",()=>{
 const main=text("src/app/supplier/products/page.tsx");
 const client=text("src/app/supplier/products/simple-products.tsx");
 const edit=text("src/app/supplier/products/[id]/page.tsx");
 const home=text("src/app/supplier/page.tsx");
 assert.match(main,/auth\.user\.email_confirmed_at/);
 assert.match(main,/\.in\("role",\["owner","manager"\]\)/);
 assert.match(main,/stores\.length!==1/);
 assert.match(main,/\.eq\("store_id",store\.id\)/);
 assert.match(main,/count===value\.data\?\.length/);
 assert.match(main,/buildSupplierSheetCards/);
 assert.match(client,/filterProductWorkspace/);
 assert.match(client,/CompactVariantCard/);
 assert.match(client,/SupplierParentReviewControls/);
 assert.match(client,/Search products, sizes or SKU/);
 assert.match(client,/href=\{"\/supplier\/products\/"\+p\.id\}/);
 assert.match(edit,/ProductRowEditor/);
 assert.match(edit,/ProductImageUploader/);
 assert.match(edit,/SupplierListingControls/);
 assert.match(edit,/\.eq\("id",id\)\.maybeSingle\(\)/);
 assert.match(edit,/memberships\.some\(m=>m\.supplier_id===store\.supplier_id\)/);
 assert.match(home,/Manage products/);
 assert.match(home,/href="\/supplier\/products"/);
 assert.doesNotMatch(main,/service_role|\.insert\(|\.update\(|\.delete\(|\.rpc\("createInvoice"|\.rpc\("reserve/);
 assert.doesNotMatch(edit,/service_role|\.from\("apex_supplier_variant_review_items"\)\.insert/);
});
