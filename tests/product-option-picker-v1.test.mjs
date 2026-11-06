import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 validateProductOptions,productOptionChoices,pickProductOption,
 PRODUCT_OPTION_PICKER_VERSION,
} from "../src/lib/catalog/product-option-picker-v1.mjs";

const id=n=>String(n).repeat(8)+"-"+String(n).repeat(4)+"-4"+String(n).repeat(3)+
 "-8"+String(n).repeat(3)+"-"+String(n).repeat(12);
const row=(n,carrierOil,strength,size,retailPriceCents)=>({
 id:id(n),carrierOil,strength,size,retailPriceCents,
});
const options=[
 row(1,"MCT","100 mg","10 mL",1200),
 row(2,"GSO","100 mg","10 mL",1200),
 row(3,"MCT","100 mg","20 mL",1900),
 row(4,"GSO","100 mg","20 mL",1900),
 row(5,"MCT","200 mg","10 mL",1500),
];

test("five source-supported combinations remain five; no automatic expansion",()=>{
 const valid=validateProductOptions(options);
 assert.ok(valid);
 assert.equal(valid.length,5);
 assert.equal(valid.every(x=>Object.isFrozen(x)),true);
 assert.equal(Object.isFrozen(valid),true);
 assert.equal(PRODUCT_OPTION_PICKER_VERSION,1);
});

test("oil, strength and size choices follow only the selected path",()=>{
 assert.deepEqual(productOptionChoices(options,id(1),"carrierOil"),["MCT","GSO"]);
 assert.deepEqual(productOptionChoices(options,id(1),"strength"),["100 mg","200 mg"]);
 assert.deepEqual(productOptionChoices(options,id(2),"strength"),["100 mg"]);
 assert.deepEqual(productOptionChoices(options,id(5),"size"),["10 mL"]);
 assert.deepEqual(productOptionChoices(options,id(2),"size"),["10 mL","20 mL"]);
});

test("changing oil retains the same size and strength when possible",()=>{
 const result=pickProductOption(options,id(3),"carrierOil","GSO");
 assert.equal(result.id,id(4));
 assert.equal(result.retailPriceCents,1900);
});

test("invalid strength/size combination falls back to an actual product option",()=>{
 const chosen=pickProductOption(options,id(5),"carrierOil","GSO");
 assert.equal(chosen.id,id(2));
 assert.equal(chosen.retailPriceCents,1200);
 assert.equal(pickProductOption(options,id(2),"strength","200 mg").id,id(2));
 assert.equal(pickProductOption(options,id(5),"size","20 mL").id,id(5));
});

test("one-option products work without creating imaginary dropdown values",()=>{
 const only=[row(1,"MCT","100 mg","10 mL",1200)];
 assert.deepEqual(productOptionChoices(only,id(1),"carrierOil"),["MCT"]);
 assert.equal(pickProductOption(only,id(1),"carrierOil","GSO").id,id(1));
 assert.deepEqual(productOptionChoices([row(1,"","","",1200)],id(1),"size"),[""]);
});

test("duplicate identifiers/options, malformed price, extra keys and formulas fail closed",()=>{
 for(const bad of [
  [options[0],options[0]],
  [options[0],{...options[0],id:id(6),retailPriceCents:1300}],
  [{...options[0],retailPriceCents:NaN}],
  [{...options[0],retailPriceCents:12.75}],
  [{...options[0],retailPriceCents:0}],
  [{...options[0],carrierOil:"MCT/GSO"}],
  [{...options[0],strength:"=A1*2"}],
  [{...options[0],size:"10 mL/20 mL"}],
  [{...options[0],sourceCost:1}],
  [{...options[0],id:"wrong"}],
  [],
  null,
 ]){
  assert.equal(validateProductOptions(bad),null);
 }
 assert.equal(pickProductOption([options[0],options[0]],id(1),"size","10 mL"),null);
});

test("UI is an admin synthetic preview and has no order or cart activation",()=>{
 const ui=readFileSync("src/app/catalog/product/[id]/product-options.tsx","utf8");
 const qa=readFileSync("src/app/admin/fulfillment-qa/page.tsx","utf8");
 assert.match(ui,/Carrier oil/);
 assert.match(ui,/Strength/);
 assert.match(ui,/Size/);
 assert.match(ui,/pickProductOption/);
 assert.match(ui,/retailPriceCents/);
 assert.match(ui,/Checkout unavailable/);
 assert.match(ui,/type="button" disabled/);
 assert.doesNotMatch(ui,/SaveCatalogItem|createInvoice|createOrder|useCustomerCart|localStorage|fetch\(/);
 assert.match(qa,/isVerifiedPlatformAdmin/);
 assert.match(qa,/<CompactVariantCard name="Sample Product A"/);
 assert.match(qa,/<CompactVariantCard name="Sample Product B"/);
 assert.match(qa,/variants=\{sampleOptions\}/);
 assert.match(qa,/variants=\{singleSampleOption\}/);
 assert.match(qa,/Private demo with invented sample amounts/);
});
