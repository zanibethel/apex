/**
 * SERVER-ONLY bridge from Track 1's client selection contract to Track 2's
 * immutable held-order validator. Never call with a browser-sourced store ID
 * or publish the returned delivery details/HMACs in an HTTP response.
 */
import {parseCustomerCheckoutHandoffV1} from "../checkout/customer-handoff-v1.mjs";
import {prepareCheckoutOrderHandoffV1} from "../payments/checkout-order-handoff-v1.mjs";

export const TRACK2_CHECKOUT_MAX_LINES=8;

const fail=reason=>Object.freeze({
 ok:false,reason,canReserveStock:false,canCreateOrder:false,
 canCreateInvoice:false,canPay:false,
});

/**
 * trustedStoreId MUST be resolved independently on the server, not from
 * payload, URL or browser claims. fingerprintKey is a server-only secret.
 * Never writes an order, reserves stock, logs personal data or makes payments.
 */
export function prepareTrack1CheckoutHandoffForTrack2V1(raw,{
 trustedStoreId,fingerprintKey,
}={}){
 const parsed=parseCustomerCheckoutHandoffV1(raw);
 if(!parsed.ok)return fail("Invalid customer checkout request");
 const {request}=parsed;
 // Track 1's review cart supports up to 20 distinct products, but Track 2's
 // current atomic admission scope is only 8. Reject all 9+; never truncate.
 if(request.cart.items.length>TRACK2_CHECKOUT_MAX_LINES)
  return fail("Checkout currently supports up to 8 distinct products");
 const canonical={
  schema_version:1,
  store_id:trustedStoreId,
  request_id:request.requestId,
  items:request.cart.items.map(({product_id,quantity})=>({product_id,quantity})),
  box_size:request.cart.boxSize,
  promotion_code:request.cart.code,
  delivery:request.delivery,
 };
 const track2=prepareCheckoutOrderHandoffV1(canonical,{
  trustedStoreId,fingerprintKey,
 });
 if(!track2.ok)return fail("Checkout handoff validation unavailable");
 // Do not expose this returned object to a browser; it carries protected
 // delivery and HMAC identities for a future trusted Track 2 transaction.
 return track2;
}
