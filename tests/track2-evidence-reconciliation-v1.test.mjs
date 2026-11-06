import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {reconcileOrderEvidenceV1} from "../src/lib/payments/order-evidence-reconciliation-v1.mjs";

const uid = n => "e3040000-0000-4000-8000-" + String(n).padStart(12,"0");
const [store,order,lineA,lineB,productA,productB,authA,authB,validation,event] =
 Array.from({length:10},(_,i)=>uid(i+1));
const nowUtc="2026-11-06T23:00:00.000Z";
const reviewedAt="2026-11-06T22:50:00.000Z";
const grossCents="15000";
function fixture() {
 return {
  order: {store_id:store,order_id:order,original_purchased_at_utc:"2026-11-06T22:00:00.000Z",
   source_order_reference:"ORD-304-TEST",currency:"USD",gross_cents:grossCents,
   line_count:2,record_status:"held_unverified"},
  lines: [
   {store_id:store,order_id:order,line_id:lineA,line_number:1,product_id:productA,
    quantity:2,unit_price_cents:"5000",subtotal_cents:"10000"},
   {store_id:store,order_id:order,line_id:lineB,line_number:2,product_id:productB,
    quantity:1,unit_price_cents:"5000",subtotal_cents:"5000"},
  ],
  payment: {provider:"BTCPay",provider_store_id:"BTCPAY-SYNTHETIC-STORE",
   invoice_id:"INV-304-SYNTH",store_id:store,order_id:order,
   metadata_order_id:order,invoice_currency:"USD",invoice_amount_cents:grossCents,
   invoice_status:"Settled",additional_status:"None",observed_at_utc:reviewedAt},
  events: [{event_id:event,kind:"settlement_observed",store_id:store,
   order_id:order,invoice_id:"INV-304-SYNTH",raw_sha256:"a".repeat(64),
   observed_at_utc:reviewedAt}],
  lineReviews: [
   {store_id:store,order_id:order,line_id:lineA,authorization_id:authA,
    decision:"independently_approved",transport_decision:"independently_approved",
    review_version:1,expires_at_utc:"2026-11-07T23:00:00.000Z",revoked_at_utc:null},
   {store_id:store,order_id:order,line_id:lineB,authorization_id:authB,
    decision:"independently_approved",transport_decision:"independently_approved",
    review_version:1,expires_at_utc:"2026-11-07T23:00:00.000Z",revoked_at_utc:null},
  ],
  destination:{store_id:store,order_id:order,envelope_exists:true,
   validation_reference:validation,validated_at_utc:reviewedAt},
 };
}
const assess = data => reconcileOrderEvidenceV1(data,{nowUtc});
const denied = (mutation, code) => {
 const data=fixture();mutation(data);
 const result=assess(data);
 assert.ok(result.reasonCodes.includes(code), code + " was not detected: " + result.reasonCodes);
 assert.equal(result.canShip,false);
 assert.equal(result.canPurchaseLabel,false);
 assert.equal(result.canRecordTracking,false);
};

test("consistent synthetic evidence still never becomes trusted settlement or a fulfillment grant",()=>{
 const result=assess(fixture());
 assert.equal(result.status,"reconciled_unverified");
 assert.deepEqual(result.reasonCodes,[]);
 assert.deepEqual(result.inspected,{
  lineCount:2,quantity:3,subtotalCents:"15000",distinctProducts:2,eventsInspected:1,
 });
 for (const k of ["providerSignatureVerified","independentSettlementVerified",
  "legalEligibilityVerified","deliveryAccessAuthorized",
  "canReleaseCheckout","canShip","canPurchaseLabel","canRecordTracking"])
  assert.equal(result[k],false,k);
 assert.ok(Object.isFrozen(result));
});

test("refuses missing and mismatched immutable order identity/amounts",()=>{
 denied(d=>{d.order.record_status="eligible"}, "original_order_invalid_or_not_held");
 denied(d=>{d.order.order_id=uid(99)}, "provider_order_amount_or_scope_conflict");
 denied(d=>{d.order.line_count=3}, "line_completeness_unverified");
 denied(d=>{d.lines[1].store_id=uid(40)}, "line_identity_amount_or_scope_conflict");
 denied(d=>{d.lines[1].line_id=d.lines[0].line_id}, "line_identity_amount_or_scope_conflict");
 denied(d=>{d.lines[1].subtotal_cents="3000"}, "line_identity_amount_or_scope_conflict");
 denied(d=>{d.lines.pop()}, "line_completeness_unverified");
 denied(d=>{d.lines[0].line_number=2}, "line_identity_amount_or_scope_conflict");
 denied(d=>{d.order.original_purchased_at_utc="2026-11-07T22:00:00.000Z"},
  "purchase_time_in_future");
});

test("refuses provider claims that cannot be reconciled to original purchase",()=>{
 denied(d=>{d.payment=null}, "provider_readback_unavailable");
 denied(d=>{d.payment.metadata_order_id=uid(77)}, "provider_order_amount_or_scope_conflict");
 denied(d=>{d.payment.store_id=uid(77)}, "provider_order_amount_or_scope_conflict");
 denied(d=>{d.payment.invoice_amount_cents="14999"}, "provider_order_amount_or_scope_conflict");
 denied(d=>{d.payment.invoice_currency="BTC"}, "provider_readback_invalid");
 denied(d=>{d.payment.invoice_status="Processing"}, "settlement_not_independently_confirmed");
 denied(d=>{d.payment.additional_status="PaidPartial"}, "settlement_not_independently_confirmed");
 denied(d=>{d.payment.observed_at_utc="2026-11-04T22:00:00.000Z"},
  "provider_observation_stale_or_future");
 denied(d=>{d.payment.observed_at_utc="2026-11-07T22:00:00.000Z"},
  "provider_observation_stale_or_future");
});

test("refund, reversal, invalidation or revocation remains sticky even after observed settlement",()=>{
 for (const kind of ["refund_observed","reversal_observed",
  "invoice_invalid_observed","eligibility_revoked"])
  denied(d=>{d.events.push({...d.events[0],event_id:uid(99),kind})},
   "refund_reversal_or_revocation_observed");
});

test("exact event replay is harmless; changed event and cross-store replay are rejected",()=>{
 const original=fixture();
 original.events.push({...original.events[0]});
 assert.equal(assess(original).status,"reconciled_unverified");
 denied(d=>{d.events.push({...d.events[0],kind:"refund_observed"})},
  "provider_event_replay_conflict");
 denied(d=>{d.events[0].invoice_id="DIFFERENT"}, "provider_event_scope_conflict");
 denied(d=>{d.events[0].store_id=uid(99)}, "provider_event_scope_conflict");
 denied(d=>{d.events[0].raw_sha256="bad"}, "provider_event_invalid");
 denied(d=>{d.events=Array.from({length:101},()=>d.events[0])},
  "provider_event_history_unavailable");
});

test("per-line authorizations must be unique, current, complete and transport-specific",()=>{
 denied(d=>{d.lineReviews.pop()}, "per_line_authorization_incomplete");
 denied(d=>{d.lineReviews[1].line_id=d.lineReviews[0].line_id},
  "per_line_authorization_identity_conflict");
 denied(d=>{d.lineReviews[1].store_id=uid(42)},
  "per_line_authorization_identity_conflict");
 denied(d=>{d.lineReviews[1].decision="supplier_checkbox"},
  "product_transport_authorization_missing_expired_or_revoked");
 denied(d=>{d.lineReviews[1].transport_decision="not_verified"},
  "product_transport_authorization_missing_expired_or_revoked");
 denied(d=>{d.lineReviews[1].revoked_at_utc="2026-11-06T22:55:00.000Z"},
  "product_transport_authorization_missing_expired_or_revoked");
 denied(d=>{d.lineReviews[1].expires_at_utc="2026-11-06T22:59:00.000Z"},
  "product_transport_authorization_missing_expired_or_revoked");
});

test("protected delivery claims never expose or authorize delivery data",()=>{
 denied(d=>{d.destination=null}, "protected_delivery_validation_unavailable");
 denied(d=>{d.destination.envelope_exists=false}, "protected_delivery_validation_unavailable");
 denied(d=>{d.destination.store_id=uid(77)}, "protected_delivery_validation_unavailable");
 denied(d=>{d.destination.plaintext_address="nope"}, "protected_delivery_validation_unavailable");
 const result=assess(fixture());
 assert.equal(JSON.stringify(result).includes("address"),false);
 assert.equal(result.deliveryAccessAuthorized,false);
});

test("no input route, provider API, data mutation, or entitlement flags embedded in helper",()=>{
 const source=readFileSync("src/lib/payments/order-evidence-reconciliation-v1.mjs","utf8");
 assert.doesNotMatch(source,/fetch\(|createInvoice\(|\.rpc\(|\.insert\(|\.update\(|service_role|NEXT_PUBLIC_/);
 assert.match(source,/canShip: false/);
 assert.match(source,/independentSettlementVerified: false/);
 const route=readFileSync("src/app/api/checkout/handoff/v1/route.ts","utf8");
 assert.match(route,/CHECKOUT_UNAVAILABLE/);
});
