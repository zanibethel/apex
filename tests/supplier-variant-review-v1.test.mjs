import test from "node:test";
import assert from "node:assert/strict";
import { buildSupplierVariantReviewV1, SUPPLIER_VARIANT_REVIEW_VERSION,
  SUPPLIER_VARIANT_REVIEW_LIMIT } from "../src/lib/catalog/supplier-variant-review-v1.mjs";
const store = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherStore = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const candidate = (overrides = {}) => ({
  sourceRow: 4, parentTitle: "Sample Product", strength: "100 mg",
  size: "10 mL", carrierOil: "MCT", retailPrice: "40.00",
  sku: "", requiresClarification: false, ...overrides,
});
const snapshot = (overrides = {}) => ({
  id, storeId: store, parentTitle: "Sample Product", strength: "100 mg",
  size: "10 mL", carrierOil: "MCT", retailPriceCents: 4000,
  sku: "SAMPLE-MCT-100", ...overrides,
});
const review = (rows, existingVariants = [], storeId = store) =>
  buildSupplierVariantReviewV1({schemaVersion: 1, storeId, rows, existingVariants});

test("one product offers two oils, two sizes and distinct retail prices without guessing SKU or stock", () => {
  const source=[
    candidate(), candidate({carrierOil:"GSO"}),
    candidate({size:"20 mL",retailPrice:"65"}),
    candidate({size:"20 mL",carrierOil:"GSO",retailPrice:"$65.00"}),
  ];
  const x=review(source);
  assert.equal(x.ok,true);
  assert.equal(x.rows.length,4);
  assert.equal(new Set(x.rows.map(r=>r.variantKey)).size,4);
  assert.deepEqual(x.rows.map(r=>r.retailPriceCents),[4000,4000,6500,6500]);
  assert.equal(x.rows.every(r=>r.sku===null && r.verifiedOnHand===null &&
    r.sourceCostCents===null && !r.canPublish && !r.canPlaceOrder && !r.canAdjustStock),true);
  assert.equal(x.canApplyChanges,false);
  assert.equal(Object.isFrozen(x),true);
  assert.deepEqual(x,review(source));
});

test("MCT-only, GSO-only, and no-oil variants stay distinct and do not Cartesian-expand", () => {
  const x=review([
    candidate({carrierOil:"MCT"}),
    candidate({carrierOil:"GSO",size:"20 mL"}),
    candidate({carrierOil:"",size:"",strength:""}),
  ]);
  assert.equal(x.rows.length,3);
  assert.deepEqual(x.rows.map(r=>r.carrierOil),["MCT","GSO",""]);
});

test("duplicate upload is idempotent, changes stay in review and an existing SKU is preserved", () => {
  const current=snapshot();
  const x=review([candidate(),candidate(),candidate({retailPrice:"45.50",size:"20 mL"})],[current]);
  assert.equal(x.duplicatesSuppressed,1);
  assert.equal(x.rows.length,2);
  assert.equal(x.rows[0].status,"existing_unchanged");
  assert.equal(x.rows[0].existingId,current.id);
  assert.equal(x.rows[0].sku,current.sku);
  const updated=review([candidate({retailPrice:"45.50"})],[current]);
  assert.equal(updated.rows[0].status,"proposed_edit");
  assert.equal(updated.rows[0].sku,current.sku);
  assert.equal(updated.canApplyChanges,false);
});

test("conflicting prices for the same option hold all rows regardless of source ordering", () => {
  const items=[candidate({sourceRow:10,retailPrice:"40"}),candidate({sourceRow:11,retailPrice:"45"})];
  for(const rows of [items,items.toReversed()]){
    const x=review(rows);
    assert.equal(x.rows.length,0);
    assert.equal(x.blockers.length,2);
    assert.equal(x.hasUnresolvedIssues,true);
  }
});

test("duplicate SKU across variants and existing SKU collision fail closed",()=>{
  const x=review([
    candidate({sku:"ABC",carrierOil:"MCT"}),
    candidate({sku:"ABC",carrierOil:"GSO"}),
  ]);
  assert.equal(x.rows.length,0);
  assert.equal(x.blockers.length,2);
  const collision=review([candidate({size:"20 mL",sku:"SAMPLE-MCT-100"})],[snapshot()]);
  assert.equal(collision.rows.length,0);
  assert.equal(collision.blockers[0].reason,"sku_option_identity_conflict");
});

test("ambiguous prices, unresolved options, spreadsheet formulas and manual exceptions block",()=>{
  const x=review([
    candidate({sourceRow:10,retailPrice:"$40/$65"}),
    candidate({sourceRow:11,carrierOil:"MCT/GSO"}),
    candidate({sourceRow:12,size:"10mL/20mL"}),
    candidate({sourceRow:13,requiresClarification:true}),
    candidate({sourceRow:14,retailPrice:"=H5*2"}),
    candidate({sourceRow:15,retailPrice:"0"}),
    candidate({sourceRow:16,retailPrice:"60.001"}),
    candidate({sourceRow:17,parentTitle:"=FORMULA"}),
  ]);
  assert.equal(x.rows.length,0);
  assert.equal(x.blockers.length,8);
});

test("supplier scope, malformed snapshots, unknown keys and oversized inputs fail closed",()=>{
  assert.equal(review([candidate()],[snapshot({storeId:otherStore})]).ok,false);
  assert.equal(review([candidate()],[snapshot({retailPriceCents:NaN})]).ok,false);
  assert.equal(review([candidate({retailPrice:"-10"})]).rows.length,0);
  assert.equal(review([{...candidate(),published:true}]).rows.length,0);
  assert.equal(review([candidate()],[snapshot({id:"not-uuid"})]).ok,false);
  assert.equal(review([candidate()],[snapshot(),snapshot({id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"})]).blockers.length,1);
  assert.equal(review(Array.from({length:SUPPLIER_VARIANT_REVIEW_LIMIT+1},()=>candidate())).ok,false);
  assert.equal(buildSupplierVariantReviewV1({schemaVersion:2,storeId:store,rows:[candidate()],existingVariants:[]}).ok,false);
  assert.equal(SUPPLIER_VARIANT_REVIEW_VERSION,1);
});
