// Track 1 -> Track 2 handoff request schema. The caller controls ONLY
// selection, code, packaging preference and delivery data. No client prices,
// inventory claims, taxes, invoice or payment authority can cross this border.
import {normalizeCartSelections} from "../cart/customer-cart.mjs";
import {validateDeliveryDetails} from "./delivery-preparation.mjs";

export const CUSTOMER_CHECKOUT_HANDOFF_VERSION=1;
const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exact=(value,keys)=>value!==null&&typeof value==="object"&&
 !Array.isArray(value)&&Object.keys(value).length===keys.length&&
 Object.keys(value).every(key=>keys.includes(key));
const reject=(reason)=>Object.freeze({ok:false,reason});

export function parseCustomerCheckoutHandoffV1(payload){
 if(!exact(payload,["schemaVersion","requestId","cart","delivery"])||
  payload.schemaVersion!==CUSTOMER_CHECKOUT_HANDOFF_VERSION||
  typeof payload.requestId!=="string"||!UUID_V4.test(payload.requestId))
  return reject("Invalid checkout handoff version or request");
 const cart=payload.cart;
 if(!exact(cart,["items","code","boxSize"])||
  !Array.isArray(cart.items)||cart.items.length===0||
  cart.items.length>20||!["auto","medium"].includes(cart.boxSize)||
  typeof cart.code!=="string"||
  (cart.code!==""&&!/^[A-Z0-9_-]{3,24}$/.test(cart.code)))
  return reject("Invalid cart handoff");
 const items=normalizeCartSelections(cart.items);
 if(items.length!==cart.items.length)return reject("Invalid cart handoff");
 const delivery=validateDeliveryDetails(payload.delivery);
 if(!delivery.valid||!delivery.details)
  return reject("Invalid delivery details");
 return Object.freeze({
  ok:true,
  // Server-only normalized values: must not be reflected in an HTTP response,
  // analytics, logs, cookie, URL, localStorage or public record.
  request:Object.freeze({
   schemaVersion:CUSTOMER_CHECKOUT_HANDOFF_VERSION,
   requestId:payload.requestId.toLowerCase(),
   cart:Object.freeze({
    items:Object.freeze(items.map(item=>Object.freeze(item))),
    code:cart.code,
    boxSize:cart.boxSize,
   }),
   delivery:delivery.details,
  }),
 });
}
