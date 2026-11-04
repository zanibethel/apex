import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateDeliveryDetails,summarizeDeliveryPreparation,EMPTY_DELIVERY_DETAILS}
 from "../src/lib/checkout/delivery-preparation.mjs";
import {summarizePrivateStockObservations}
 from "../src/lib/checkout/private-stock-readiness-summary.mjs";

const one="64000000-0000-0000-0000-000000000001";
const two="64000000-0000-0000-0000-000000000002";
const cart=[{product_id:one,quantity:2}];
const delivery={
 firstName:"  Taylor ",lastName:"Example",email:" TAYLOR@example.org ",
 phone:"(806) 555-0111",address1:"123 Main St",
 address2:"Apt 4",city:"Lubbock",state:"tx",postalCode:"79401-1234",
};
const read=p=>readFileSync(p,"utf8");

test("valid U.S. delivery details are normalized, not persisted",()=>{
 const validated=validateDeliveryDetails(delivery);
 assert.equal(validated.valid,true);
 assert.deepEqual(validated.errors,{});
 assert.equal(validated.details.firstName,"Taylor");
 assert.equal(validated.details.email,"taylor@example.org");
 assert.equal(validated.details.state,"TX");
 assert.equal(validated.details.postalCode,"79401-1234");
 const prepared=summarizeDeliveryPreparation(delivery,cart);
 assert.equal(prepared.contactFormatValid,true);
 assert.equal(prepared.cartStructureValid,true);
 assert.equal(prepared.status,"preparation_only");
 for(const capability of ["canSubmitOrder","canReserveStock","canCreateInvoice","canPay"])
  assert.equal(prepared[capability],false);
 const noPhone=validateDeliveryDetails({...delivery,phone:"",address2:"",postalCode:"79401"});
 assert.equal(noPhone.valid,true);
});

test("bad contact, unsupported destination and hostile input fail format validation",()=>{
 const invalids=[
  {...delivery,firstName:""},
  {...delivery,lastName:""},
  {...delivery,email:"foo@example"},
  {...delivery,email:"a@b.co\nX-Header: forged"},
  {...delivery,phone:"123"},
  {...delivery,phone:"(800) 333-0000 ext.123"},
  {...delivery,address1:""},
  {...delivery,address1:"9"},
  {...delivery,city:"A"},
  {...delivery,state:"ZZ"},
  {...delivery,postalCode:"7940"},
  {...delivery,postalCode:"79401x"},
  {...delivery,postalCode:"79401-"},
  {...delivery,address2:"B".repeat(101)},
  {...delivery,extra:"hidden"},
  null,
 ];
 for(const value of invalids){
  const result=validateDeliveryDetails(value);
  assert.equal(result.valid,false,JSON.stringify(value));
  assert.equal(result.details,null);
 }
 const empty=validateDeliveryDetails({...EMPTY_DELIVERY_DETAILS});
 assert.equal(empty.valid,false);
 assert.ok(empty.errors.email);
});

test("cart preparation rejects duplicate, stale and over-limit local selections",()=>{
 for(const values of [
  [],
  [{product_id:one,quantity:0}],
  [{product_id:"demo-item",quantity:1}],
  [cart[0],cart[0]],
  [{product_id:one,quantity:11}],
  [{product_id:one,quantity:1,priceCents:1}],
  [{product_id:one,quantity:10},{product_id:two,quantity:10},...Array.from({length:4},(_,i)=>({
   product_id:"64000000-0000-0000-0000-"+String(i+4).padStart(12,"0"),quantity:10,
  }))],
 ]){
  const result=summarizeDeliveryPreparation(delivery,values);
  assert.equal(result.cartStructureValid,false,JSON.stringify(values));
  assert.equal(result.canSubmitOrder,false);
 }
});

test("private stock readbacks distinguish in-stock, zero and unavailable without sale rights",()=>{
 const stock=(availableUnits)=>({
  status:"observed_private",observed:true,availableUnits,
  canOrder:false,canPay:false,
 });
 const output=summarizePrivateStockObservations([
  stock(12),stock(0),null,stock(2),{...stock(4),canPay:true},
 ]);
 assert.deepEqual(output,{
  status:"private_only",itemsChecked:5,stockObserved:3,
  inStock:2,soldOut:1,notVerified:2,
  canOpenPublicCatalog:false,canCreateOrder:false,
 });
 assert.equal(summarizePrivateStockObservations({}).status,"unverified");
 assert.equal(summarizePrivateStockObservations(Array(251).fill(null)).canCreateOrder,false);
});

test("delivery UI is a browser-only review with no upload or order action",()=>{
 const ui=read("src/app/cart/delivery-details-form.tsx");
 const cartPage=read("src/app/cart/customer-cart-page.tsx");
 const adminPage=read("src/app/admin/checkout-readiness/page.tsx");
 const model=read("src/lib/checkout/delivery-preparation.mjs");
 assert.match(ui,/summarizeDeliveryPreparation/);
 assert.match(ui,/setConfirmed/);
 assert.match(ui,/remain in this browser tab/);
 assert.match(ui,/No order was placed/);
 assert.doesNotMatch(ui,/\bfetch\(|localStorage|sessionStorage|form action=|createOrder|createInvoice/);
 assert.match(cartPage,/DeliveryDetailsForm/);
 assert.match(cartPage,/apex-customer-checkout" disabled/);
 assert.match(adminPage,/summarizePrivateStockObservations/);
 assert.match(adminPage,/Recorded stock does not enable customer purchases/);
 assert.match(model,/normalizeCartSelections/);
 assert.doesNotMatch(adminPage,/update.*products|setPublicRelease|toggleCheckout/);
});
