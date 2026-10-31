import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {previewUsdCents,previewCompareAtCents} from "../src/lib/catalog/offer-preview-money.mjs";

const read=p=>readFileSync(p,"utf8");
const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
const inline=read("src/app/supplier/catalog/bulk-inline-offer.tsx");
const offer=read("src/components/catalog/offer-tile.tsx");
const bulkPage=read("src/app/supplier/catalog/bulk/page.tsx");
const csv=read("src/app/supplier/catalog/csv-product-import.tsx");
const css=read("src/app/globals.css");

test("live unsaved price parsing is exact to cents and never fabricates zero prices",()=>{
 assert.equal(previewUsdCents("12.99"),1299);
 assert.equal(previewUsdCents("20"),2000);
 assert.equal(previewUsdCents("0.01"),1);
 for(const input of [""," ","0","0.00","-1","9.999","$5","2e3","Infinity",undefined]){
  assert.ok(Number.isNaN(previewUsdCents(input)),String(input));
 }
 assert.ok(Number.isNaN(previewUsdCents("10000000")));
});

test("compare-at discounts display only with valid greater reference prices",()=>{
 assert.equal(previewCompareAtCents(1000,"15.00"),1500);
 for(const reference of ["", "0", "9.99", "10.00","-20","12.999","fake"]){
  assert.equal(previewCompareAtCents(1000,reference),null,reference);
 }
 assert.equal(previewCompareAtCents(NaN,"15.00"),null);
});

test("editable bulk rows render a storefront-style offer tile from current fields",()=>{
 assert.match(editor,/import \{BulkInlineOffer\}/);
 assert.match(editor,/const \[showOfferTiles,setShowOfferTiles\]=useState\(true\)/);
 assert.match(editor,/Hide live offer tiles/);
 assert.match(editor,/Show live offer tiles/);
 assert.match(editor,/aria-pressed=\{showOfferTiles\}/);
 assert.match(editor,/const category=categories\.find\(c=>c\.id===r\.categoryId\)\?\.name/);
 assert.match(editor,/const cardMedia=r\.id\?savedMedia\.get\(r\.id\):undefined/);
 assert.match(editor,/quantityOnHand-cardMedia\.quantityReserved/);
 assert.match(editor,/showOfferTiles&&<BulkInlineOffer row=\{r\} category=\{category\}/);
 assert.match(inline,/<OfferTile name=\{row\.name\.trim\(\)\|\|"Product title"\}/);
 assert.match(inline,/sku=\{row\.sku\.trim\(\)\|\|"SKU pending"\}/);
 assert.match(inline,/description=\{row\.description\}/);
 assert.match(inline,/priceCents=\{priceCents\}/);
 assert.match(inline,/compareAtCents=\{compareAtCents\}/);
 assert.match(inline,/imageUrl=\{imageUrl\}/);
 assert.match(inline,/currency="USD" availableStock=\{availableStock\}/);
 assert.match(offer,/Stock not entered/);
 assert.match(bulkPage,/createSignedUrl\(product\.image_path!,120\)/);
 assert.match(csv,/needsSave:true/);
});

test("unsaved or imported drafts cannot use tile preview to request publication",()=>{
 assert.match(inline,/const saved=Boolean\(row\.id\)&&!row\.needsSave/);
 assert.match(inline,/UNSAVED · DRAFT/);
 assert.match(inline,/SAVED · PRIVATE/);
 assert.match(inline,/Live preview of your current edits/);
 assert.match(inline,/row\.id/);
 assert.match(inline,/Select this row and choose Save selected to continue/);
 assert.match(inline,/Full preview/);
 assert.match(inline,/onPublish/);
 assert.match(editor,/const savedSelected=selectedRows\.filter\(r=>Boolean\(r\.id\)&&!r\.needsSave\)/);
 assert.match(editor,/r\.id&&!r\.needsSave/);
 assert.match(editor,/saveBulkProductDrafts/);
 assert.doesNotMatch(inline,/\.rpc\(|\.update\(|createPublicUrl|service_role|is_published:true|checkout|priceCents.*sourceCost/);
});

test("private cost is excluded from the customer-like tile, and UI remains responsive",()=>{
 assert.doesNotMatch(inline+offer,/internal_source_cost|sourceCost|wholesale|supplier_wallet/);
 assert.match(css,/\.apex-bulk-card-layout/);
 assert.match(css,/grid-template-columns:minmax\(0,1\.15fr\) minmax\(255px,\.85fr\)/);
 assert.match(css,/@media\(max-width:950px\)/);
 assert.match(css,/@media\(max-width:500px\)/);
 assert.match(css,/\.apex-bulk-inline-preview/);
 assert.match(css,/\.apex-bulk-inline-preview \.apex-offer-tile/);
});
