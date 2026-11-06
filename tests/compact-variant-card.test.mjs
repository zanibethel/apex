import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateProductOptions} from "../src/lib/catalog/product-option-picker-v1.mjs";

const read=path=>readFileSync(path,"utf8");
const ids=[
 "11111111-1111-4111-8111-111111111111",
 "22222222-2222-4222-8222-222222222222",
 "33333333-3333-4333-8333-333333333333",
];
const options=[
 {id:ids[0],carrierOil:"MCT",strength:"100 mg",size:"10 mL",retailPriceCents:1200},
 {id:ids[1],carrierOil:"GSO",strength:"100 mg",size:"10 mL",retailPriceCents:1200},
 {id:ids[2],carrierOil:"MCT",strength:"100 mg",size:"20 mL",retailPriceCents:1900},
];

test("one parent has distinct valid option prices without multiplying product cards",()=>{
 const reviewed=validateProductOptions(options);
 assert.equal(reviewed.length,3);
 assert.equal(new Set(reviewed.map(v=>v.id)).size,3);
 assert.equal(reviewed.find(v=>v.id===ids[2]).retailPriceCents,1900);
 assert.equal(reviewed.find(v=>v.id===ids[0]).retailPriceCents,1200);
});

test("compact card presents exactly one outer article and a dropdown only for variants",()=>{
 const card=read("src/components/catalog/compact-variant-card.tsx");
 assert.match(card,/return <article className="apex-compact-product">/);
 assert.equal((card.match(/return <article className="apex-compact-product">/g)||[]).length,1);
 assert.match(card,/approved\.length>1\?/);
 assert.match(card,/<select id=\{selectId\} value=\{selected\.id\}/);
 assert.match(card,/approved\.map\(v=><option/);
 assert.match(card,/setChosenId\(event\.target\.value\)/);
 assert.match(card,/money\(selected\.retailPriceCents\)/);
 assert.match(card,/optionLabel\(selected\)!=="Standard"/);
 assert.doesNotMatch(card,/variants\.map\(.*<article|SaveCatalogItem|createInvoice|createOrder|useCustomerCart|fetch\(|localStorage/);
});

test("QA has two parent cards, with several variants inside only the first",()=>{
 const qa=read("src/app/admin/fulfillment-qa/page.tsx");
 const names=qa.match(/<CompactVariantCard name=/g)||[];
 assert.equal(names.length,2);
 assert.match(qa,/<CompactVariantCard name="Sample Product A"/);
 assert.match(qa,/<CompactVariantCard name="Sample Product B"/);
 assert.match(qa,/variants=\{sampleOptions\}/);
 assert.match(qa,/variants=\{singleSampleOption\}/);
 assert.match(qa,/isVerifiedPlatformAdmin/);
 assert.match(qa,/Private demo with invented sample amounts/);
});

test("compact card is a local presentation with no new checkout or publishing controls",()=>{
 const card=read("src/components/catalog/compact-variant-card.tsx");
 const css=read("src/components/catalog/compact-variant-card.css");
 assert.match(card,/Checkout unavailable/);
 assert.doesNotMatch(card,/price_cents.*update|stock.*update|createInvoice|payment|fetch\(/);
 assert.match(css,/grid-template-columns:repeat\(auto-fit/);
 assert.match(css,/@media\(max-width:530px\)/);
 assert.match(css,/min-height:44px/);
});
