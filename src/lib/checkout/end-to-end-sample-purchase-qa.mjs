/**
 * Closed-loop, in-memory acceptance check using the real Track 1 / Track 2
 * handoff validators and Track 3 review-only fulfillment + reporting rules.
 * This is not a payment simulator and cannot grant shipping rights.
 * No database, API, email provider, real addresses or remote service calls.
 */
import {createHmac} from "node:crypto";
import {buildCartReview} from "../cart/customer-cart.mjs";
import {prepareTrack1CheckoutHandoffForTrack2V1}
 from "../checkout/track1-to-track2-adapter-v1.mjs";
import {verifyHeldOrderReadbackV1}
 from "../payments/checkout-order-handoff-v1.mjs";
import {parseVerifiedInvoiceEvent}
 from "../payments/btcpay-sandbox.mjs";
import {reviewFulfillmentTransition,summarizeReviewAllocations}
 from "../supplier/review-only-fulfillment-state.mjs";
import {buildCumulativeReviewWorkbook}
 from "../supplier/cumulative-fulfillment-review-csv.mjs";
import {createSupplierReviewEmailPreview}
 from "../supplier/review-email-report-manifest.mjs";

const STORE="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const PRODUCT1="00000000-0000-4000-8000-000000000010";
const PRODUCT2="00000000-0000-4000-8000-000000000011";
const REQUEST_ID="a471a688-9a9d-470d-8d9c-3ee8cbb87642";
const ORDER_ID="00000000-0000-4000-8000-000000000020";
const SHIPMENT_ID="00000000-0000-4000-8000-000000000021";
const LINE_ID="00000000-0000-4000-8000-000000000022";
const ORIGINAL="2026-11-05T18:05:00.000Z";
const DAY="2026-11-05";
const FINGERPRINT_KEY="synthetic-qa-fingerprint-only-not-production-00000000";
const MOCK_WEBHOOK_KEY="synthetic-qa-webhook-secret-only";
const selections=Object.freeze([
 {product_id:PRODUCT1,quantity:2},
 {product_id:PRODUCT2,quantity:1},
]);
const shipping={
 charge_shipping:true,flat_shipping_cents:800,
 medium_flat_shipping_cents:1600,
 free_shipping_min_subtotal_cents:null,envelope_max_items:4,
};
const source=Object.freeze({
 schema_version:1,state:"rechecked_inventory_cart",
 items:[
  {product_id:PRODUCT1,quantity:2,name:"Sample Item A",
   unit_price_cents:"1500",availability:"in_stock",can_checkout:false},
  {product_id:PRODUCT2,quantity:1,name:"Sample Item B",
   unit_price_cents:"2500",availability:"in_stock",can_checkout:false},
 ],
 shipping,requested_code:"",promotion:null,
 can_place_order:false,can_create_invoice:false,
 can_reserve_stock:false,can_pay:false,
});
const customer={
 firstName:"Sample",lastName:"Customer",email:"sample@example.invalid",
 phone:"",address1:"123 Example Street",address2:"",
 city:"Testville",state:"TX",postalCode:"79401",
};
const check=(ok)=>{if(!ok)throw Error("Sample purchase contract failed");};

/**
 * Returns ONLY public-safe synthetic totals, state descriptions and flags.
 * Deliberately never serializes the handoff, contact, fingerprint or signature.
 */
export function runEndToEndSamplePurchaseQa(){
 const cart=buildCartReview(source,{
  items:selections,code:"",boxSize:"auto",
  now:new Date(ORIGINAL),
 });
 check(cart.ok&&cart.totalCents===6300&&cart.shippingCents===800&&
  cart.items.length===2&&cart.status==="stock_observed"&&
  cart.canPlaceOrder===false&&cart.canPay===false);

 const handoff=prepareTrack1CheckoutHandoffForTrack2V1({
  schemaVersion:1,requestId:REQUEST_ID,
  cart:{items:selections,code:"",boxSize:"auto"},
  delivery:customer,
 },{trustedStoreId:STORE,fingerprintKey:FINGERPRINT_KEY});
 check(handoff.ok&&handoff.status==="validated_not_admitted"&&
  handoff.canReserveStock===false&&handoff.canCreateOrder===false&&
  handoff.canCreateInvoice===false&&handoff.canPay===false&&
  handoff.unitCount===3&&handoff.items.length===2);

 // Exact shape of a synthetic held order readback. This object is NEVER
 // written to a DB, never a real order and does not establish settlement.
 const raw={
  schema_version:1,store_id:STORE,order_id:ORDER_ID,
  original_purchased_at:ORIGINAL,
  idempotency_hash:handoff.idempotencyHash,
  request_fingerprint:handoff.requestFingerprint,
  cart_fingerprint:handoff.cartFingerprint,
  line_count:2,unit_count:3,currency:"USD",
  state:"held_no_payment",can_pay:false,can_ship:false,
 };
 const held=verifyHeldOrderReadbackV1(handoff,raw);
 check(held?.orderId===ORDER_ID&&
  held?.originalPurchasedAt===ORIGINAL&&
  held?.canPay===false&&held?.canShip===false);
 // A changed same-ID payload must never silently inherit its old identity.
 check(verifyHeldOrderReadbackV1(handoff,{
  ...raw,request_fingerprint:"f".repeat(64),
 })===null);

 // Validate a wholly synthetic, cryptographically signed BTCPay-style
 // notification. Even an authentic webhook is NOT payment finality.
 const event={type:"InvoiceSettled",storeId:"qa_store_1",
  invoiceId:"qa_invoice_1",deliveryId:"qa_event_1"};
 const rawEvent=Buffer.from(JSON.stringify(event),"utf8");
 const signature="sha256="+createHmac("sha256",MOCK_WEBHOOK_KEY)
  .update(rawEvent).digest("hex");
 const parsed=parseVerifiedInvoiceEvent(rawEvent,signature,
  MOCK_WEBHOOK_KEY,"qa_store_1");
 check(parsed.type==="InvoiceSettled"&&parsed.storeId==="qa_store_1");
 let tamperRejected=false;
 try{
  parseVerifiedInvoiceEvent(Buffer.from(rawEvent.toString()+" "),
   signature,MOCK_WEBHOOK_KEY,"qa_store_1");
 }catch{tamperRejected=true;}
 check(tamperRejected);

 const allocations=summarizeReviewAllocations([{
  lineId:LINE_ID,purchasedQuantity:3,
  plannedQuantity:0,newPlanQuantity:1,
 }]);
 const transition=reviewFulfillmentTransition({
  from:"queued",to:"under_review",
  expectedRevision:1,observedRevision:1,
 });
 const stale=reviewFulfillmentTransition({
  from:"queued",to:"under_review",
  expectedRevision:1,observedRevision:2,
 });
 check(allocations?.requestedUnits===1&&
  allocations?.remainingUnplannedUnits===2&&
  allocations?.partiallyPlanned===true&&allocations?.canShip===false&&
  transition.status==="not_authorized_for_execution"&&
  transition.canTransition===false&&stale.status==="stale_version");

 const heldOrder={
  id:ORDER_ID,storeId:STORE,reference:"QA-SAMPLE-001",
  purchasedAt:ORIGINAL,readiness:"held",
  purchasedUnits:3,plannedUnits:1,unplannedUnits:2,
  lines:[
   {number:1,sku:"QA-SAMPLE-A",title:"Sample Item A",variant:"",
    purchased:2,planned:1,unplanned:1},
   {number:2,sku:"QA-SAMPLE-B",title:"Sample Item B",variant:"",
    purchased:1,planned:0,unplanned:1},
  ],
  plans:[{
   id:SHIPMENT_ID,reference:"QA-PLAN-001",
   revision:1,status:"review_only",plannedUnits:1,drafts:[],
   canShip:false,canBuyLabel:false,
  }],
  canShip:false,canBuyLabel:false,canEnterTracking:false,
 };
 const workbook=buildCumulativeReviewWorkbook([{
  storeId:STORE,total:1,limit:10,offset:0,
  hasMore:false,orders:[heldOrder],
 }],STORE,DAY);
 const report=createSupplierReviewEmailPreview(workbook,STORE,DAY);
 check(workbook.totalOrders===1&&workbook.summary.newToday===1&&
  workbook.summary.partiallyPlanned===1&&
  workbook.canSendEmail===false&&report.manifest.orders===1&&
  report.manifest.rows===3&&report.manifest.canSend===false&&
  report.manifest.shippedVerified===0&&
  report.manifest.requiresAuthenticatedAccess===true);

 return Object.freeze({
  schemaVersion:1,mode:"local_synthetic_only",
  headline:"Sample purchase contract check passed",
  summary:Object.freeze({
   items:2,units:3,merchandiseCents:5500,
   shippingCents:cart.shippingCents,totalCents:cart.totalCents,
   currency:"USD",
  }),
  stages:Object.freeze([
   Object.freeze({name:"Customer cart",status:"passed",
    detail:"Two sample items; server-side quote totals $63.00 including $8.00 optional shipping."}),
   Object.freeze({name:"Checkout handoff",status:"passed",
    detail:"Track 1 choices validated by Track 2; forged prices and checkout authority cannot cross the boundary."}),
   Object.freeze({name:"Order identity",status:"passed",
    detail:"Synthetic held order preserves the original purchase date and detects altered same-ID requests."}),
   Object.freeze({name:"Bitcoin payment",status:"test_only",
    detail:"A signed mock event passed verification; no real invoice, payment settlement or payout occurred."}),
   Object.freeze({name:"Supplier fulfillment",status:"held",
    detail:"One of three sample units is planned; two remain. No shipment, tracking or postage is authorized."}),
   Object.freeze({name:"Supplier report",status:"passed",
    detail:"A private metadata-only report was prepared with one original order; no email or customer address was sent."}),
  ]),
  liveCheckoutEnabled:false,realPaymentSettled:false,
  supplierShipmentAuthorized:false,postagePurchased:false,
  orderCreatedInDatabase:false,emailSent:false,
  simulatedProviderEventVerified:true,
  testResult:"passed_without_live_transactions",
 });
}
