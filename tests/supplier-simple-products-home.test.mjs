import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {supplierIntakeCards} from "../src/lib/catalog/supplier-intake-cards.mjs";
const file=path=>readFileSync(path,"utf8");
const rows=[
 {id:"11111111-1111-4111-8111-111111111111",source_row:4,
  parent_title:"Sample Parent",source_section:"Samples",strength:"100mg",
  size:"10mL",carrier_oil:"MCT",retail_price_cents:1200,
  review_status:"pending_review",review_note:""},
 {id:"22222222-2222-4222-8222-222222222222",source_row:4,
  parent_title:"Sample Parent",source_section:"Samples",strength:"100mg",
  size:"20mL",carrier_oil:"GSO",retail_price_cents:2200,
  review_status:"pending_review",review_note:""},
 {id:"33333333-3333-4333-8333-333333333333",source_row:5,
  parent_title:"Held Parent",source_section:"Samples",strength:"Unconfirmed",
  size:"10mL",carrier_oil:"",retail_price_cents:null,
  review_status:"needs_clarification",review_note:"Supplier confirmation needed"},
];
test("real staged options appear as one card per parent with exact prices and review links",()=>{
 const grouped=supplierIntakeCards(rows);
 assert.ok(grouped);
 assert.equal(grouped.length,2);
 const sample=grouped.find(x=>x.name==="Sample Parent");
 assert.equal(sample.options.length,2);
 assert.deepEqual(sample.options.map(o=>o.retailPriceCents),[1200,2200]);
 assert.equal(sample.anchor,"variant-4");
 const held=grouped.find(x=>x.name==="Held Parent");
 assert.equal(held.held,1);
 assert.equal(held.options.length,0);
});
test("invalid or duplicate source rows fail closed without inventing prices",()=>{
 assert.equal(supplierIntakeCards([...rows,rows[0]]),null);
 assert.equal(supplierIntakeCards([{...rows[0],retail_price_cents:null}]),null);
 assert.equal(supplierIntakeCards([{...rows[0],carrier_oil:"OIL"}]),null);
 assert.equal(supplierIntakeCards([{...rows[0],id:"made-up-id"}]),null);
});
test("supplier home directs to one product editor and keeps advanced tools collapsed",()=>{
 const dashboard=file("src/app/supplier/page.tsx");
 const bulk=file("src/app/supplier/catalog/bulk/page.tsx");
 const editor=file("src/app/supplier/catalog/bulk-editor.tsx");
 assert.match(dashboard,/href="\/supplier\/catalog\/bulk" className="button primary">Products/);
 assert.match(dashboard,/<details className="apex-bulk-advanced"/);
 assert.match(bulk,/SupplierIntakeCards cards=\{importedCards\}/);
 assert.match(bulk,/intakeCount===intakeRows\?\.length/);
 assert.match(bulk,/\.eq\("store_id",store\.id\)\.eq\("source_batch",SUPPLIER_OPTION_BATCH\)/);
 assert.match(bulk,/id="supplier-intake"/);
 assert.match(bulk,/id="supplier-extra-tools"/);
 assert.match(editor,/const \[showOfferTiles,setShowOfferTiles\]=useState\(false\)/);
 assert.match(editor,/apex-supplier-row-thumbnail/);
 assert.match(editor,/apex-supplier-card-heading/);
 assert.match(editor,/id="apex-bulk-search"/);
 assert.match(editor,/apex-supplier-batch-setup/);
 assert.match(editor,/Save changes/);
 assert.match(editor,/role="switch"/);
});
test("supplier import remains isolated from authorized saved-product updates",()=>{
 const bulk=file("src/app/supplier/catalog/bulk/page.tsx");
 const intake=file("src/app/supplier/catalog/supplier-intake-cards.tsx");
 assert.match(bulk,/supplierIntakeCards\(intakeRows\)/);
 assert.match(intake,/Review options/);
 assert.match(intake,/Existing product edits, inventory and image management stay in/);
 assert.doesNotMatch(intake,/createOrder|createInvoice|set_supplier_listing_intent|saveBulkProductDrafts|service_role|fetch\(/);
 const review=file("src/app/supplier/catalog/variant-review/page.tsx");
 assert.match(review,/id=\{"variant-"\+group\.rows\[0\]\.source_row\}/);
});
