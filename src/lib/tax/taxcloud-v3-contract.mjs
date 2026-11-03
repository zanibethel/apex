// TaxCloud v3 adapter contract for private administrative estimation.
// No credentials, provider requests or source addresses are exposed by this module.
// A successful TaxCloud cart estimate is NOT a finalized sale or signed tax receipt.
// POST /carts is the ONLY supported provider mutation; /carts/orders is forbidden.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES=new Set(("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD "+
 "MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX "+
 "UT VT VA WA WV WI WY DC").split(" "));
const INT=n=>Number.isSafeInteger(n)&&n>=0&&n<=999999999;
const money=n=>INT(n)?n/100:null;
const txt=(v,max=140)=>typeof v==="string"&&v.trim().length>0&&
 v.trim().length<=max&&!/[\x00-\x1f\x7f]/.test(v);
const zipValid=v=>typeof v==="string"&&/^\d{5}(?:-\d{4})?$/.test(v);
const cleanAddress=a=>{
 if(!a||typeof a!=="object"||a.countryCode!=="US"||
  !txt(a.line1,140)||!txt(a.city,80)||!STATES.has(a.state)||
  !zipValid(a.zip))return null;
 const {line1,city,state,zip}=a;
 return {countryCode:"US",line1:line1.trim(),city:city.trim(),
  state,zip};
};
const status=(value,reason)=>Object.freeze({status:value,reason,configured:value==="ready"});
const ENVPREFIX="APEX_TAXCLOUD_KEY_";
export function resolveTaxCloudBinding(raw,storeId,env={}){
 if(!UUID.test(storeId)||typeof raw!=="string"||raw.length>160000)
  return status("unconfigured","Missing or invalid store binding.");
 let decoded;
 try{decoded=JSON.parse(raw);}catch{return status("invalid_bindings","Store binding JSON could not be validated.");}
 if(!Array.isArray(decoded)||decoded.length<1||decoded.length>20)
  return status("invalid_bindings","Store bindings must be a bounded array.");
 const ids=new Set(),connections=new Set(),keyRefs=new Set();
 const bindings=[];
 for(const b of decoded){
  if(!b||typeof b!=="object"||!UUID.test(b.apexStoreId)||
   !UUID.test(b.connectionId)||typeof b.keyEnv!=="string"||
   !/^APEX_TAXCLOUD_KEY_[A-Z0-9_]{1,32}$/.test(b.keyEnv)||
   ids.has(b.apexStoreId)||connections.has(b.connectionId)||
   keyRefs.has(b.keyEnv))
   return status("invalid_bindings","Duplicate or invalid private provider binding.");
  ids.add(b.apexStoreId);connections.add(b.connectionId);keyRefs.add(b.keyEnv);
  bindings.push(b);
 }
 const b=bindings.find(x=>x.apexStoreId===storeId);
 if(!b)return status("no_store_binding","No TaxCloud connection is mapped to this private store.");
 const origin=cleanAddress(b.origin);
 if(!origin)return status("invalid_origin","An explicit full merchant shipping-origin address is required.");
 if(!b.productRules||typeof b.productRules!=="object"||
  Array.isArray(b.productRules)||Object.keys(b.productRules).length>250)
  return status("missing_classifications","Product tax codes have not been approved.");
 const rules={};
 for(const [id,value] of Object.entries(b.productRules)){
  if(!UUID.test(id)||!value||typeof value!=="object"||
   !Number.isSafeInteger(value.tic)||value.tic<0||value.tic>99999||
   value.reviewed!==true||
   (value.taxFreeBasisRef!==undefined&&
    !txt(value.taxFreeBasisRef,140)))
   return status("invalid_classifications","A mapped product TIC lacks a valid reviewed classification.");
  rules[id.toLowerCase()]={tic:value.tic,
   reviewed:true,taxFreeBasisRef:value.taxFreeBasisRef??null};
 }
 const key=env[b.keyEnv];
 if(typeof key!=="string"||key.trim().length<16||key.length>500||
  /[\r\n]/.test(key))
  return status("missing_key","The private TaxCloud API key is not configured.");
 return Object.freeze({status:"ready",configured:true,
  connectionId:b.connectionId,origin,productRules:rules,
  // Secret is internal only. NEVER return this object to React/client components.
  key,
 });
}
export function providerStatusPublic(config){
 const c=config&&typeof config==="object"?config:{status:"unconfigured"};
 return {status:c.status||"unconfigured",
  connected:false, // Only an authenticated Ping response establishes connection.
  originConfigured:Boolean(c.origin),classifiedProducts:c.productRules?
   Object.keys(c.productRules).length:0,
  checkoutEnabled:false};
}
export function canQuoteProduct(config,productId,collectSalesTax){
 if(config?.status!=="ready"||!UUID.test(productId)||
  typeof collectSalesTax!=="boolean")
  return {ok:false,reason:"Provider or product identity is unavailable."};
 const rule=config.productRules?.[productId.toLowerCase()];
 if(!rule||rule.reviewed!==true)
  return {ok:false,reason:"A reviewed product taxability code is required."};
 if(!collectSalesTax&&!rule.taxFreeBasisRef)
  return {ok:false,reason:"Tax collection is unchecked; an approved exemption/classification reference is required."};
 return {ok:true,tic:rule.tic};
}
export function makeTaxCloudCart({connectionId,origin,destination,productId,
 quantity,unitPriceCents,discountCents,shippingCents,tic,customerId}){
 if(!UUID.test(connectionId)||!UUID.test(productId)||
  !cleanAddress(origin)||!cleanAddress(destination)||
  !txt(customerId,120)||!Number.isInteger(quantity)||quantity<1||quantity>10||
  !INT(unitPriceCents)||unitPriceCents===0||
  !INT(discountCents)||discountCents>unitPriceCents*quantity||
  !INT(shippingCents)||!Number.isSafeInteger(tic)||tic<0||tic>99999||
  unitPriceCents*quantity>999999999)return null;
 const product={index:0,itemId:productId,
  price:money(unitPriceCents),quantity,tic};
 const shipping=shippingCents>0?{index:1,itemId:"APEX-SHIPPING",
  price:money(shippingCents),quantity:1,tic:11010}:null;
 const item={
  currency:{currencyCode:"USD"},customerId,
  origin:cleanAddress(origin),destination:cleanAddress(destination),
  lineItems:shipping?[product,shipping]:[product],
 };
 if(discountCents>0)item.discounts={
  orderDiscount:{type:"amount",value:money(discountCents)}};
 return {body:{items:[item]},
  expected:{connectionId,origin:item.origin,destination:item.destination,
   productId,quantity,tic,unitPriceCents,discountCents,
   shippingCents,discountedMerchandiseCents:unitPriceCents*quantity-discountCents}};
}
const centsFromNumber=n=>{
 if(typeof n!=="number"||!Number.isFinite(n)||n<0||n>9999999.99)return null;
 const c=Math.round(n*100);
 return INT(c)&&Math.abs(n*100-c)<0.000001?c:null;
};
function sameAddress(a,b){
 return a&&typeof a==="object"&&
  a.countryCode==="US"&&a.state===b.state&&a.city===b.city&&
  a.line1===b.line1&&a.zip===b.zip;
}
export function verifyTaxCloudCart(response,expected){
 if(!response||typeof response!=="object"||!expected||
  response.connectionId!==expected.connectionId||
  !Array.isArray(response.items)||response.items.length!==1)
  return null;
 const item=response.items[0];
 if(!item||!txt(item.cartId,160)||!Array.isArray(item.lineItems)||
  item.lineItems.length!==(expected.shippingCents>0?2:1)||
  item.currency?.currencyCode!=="USD"||
  !sameAddress(item.origin,expected.origin)||
  !sameAddress(item.destination,expected.destination))
  return null;
 const product=item.lineItems[0];
 if(!product||product.index!==0||product.itemId!==expected.productId||
  product.tic!==expected.tic||product.quantity!==expected.quantity||
  centsFromNumber(product.originalPrice??product.price)!==expected.unitPriceCents||
  !product.tax||centsFromNumber(product.tax.amount)===null)
  return null;
 const productAmount=centsFromNumber(product.price);
 if(productAmount===null||
  productAmount*expected.quantity!==expected.discountedMerchandiseCents)
  return null;
 let shippingTax=0;
 if(expected.shippingCents>0){
  const ship=item.lineItems[1];
  if(!ship||ship.index!==1||ship.itemId!=="APEX-SHIPPING"||
   ship.tic!==11010||ship.quantity!==1||
   centsFromNumber(ship.price)!==expected.shippingCents||
   centsFromNumber(ship.tax?.amount)===null)
   return null;
  shippingTax=centsFromNumber(ship.tax.amount);
 }
 const productTax=centsFromNumber(product.tax.amount);
 const totalTax=productTax+shippingTax;
 const preTaxTotal=expected.discountedMerchandiseCents+expected.shippingCents;
 if(!INT(totalTax)||!INT(preTaxTotal)||!INT(totalTax+preTaxTotal))
  return null;
 return Object.freeze({
  provider:"taxcloud_v3",source:"authenticated_https_cart",
  providerCartRef:item.cartId,
  taxEstimateCents:totalTax,productTaxCents:productTax,
  shippingTaxCents:shippingTax,preTaxTotalCents:preTaxTotal,
  estimatedTotalCents:preTaxTotal+totalTax,
  quoteFinalized:false,canCreateOrder:false,canCreateInvoice:false,
  canPay:false,expiresAt:null, // No verified durable expiry/attestation yet.
 });
}
export const TAXCLOUD_ORIGIN="https://api.v3.taxcloud.com";
export function taxCloudEndpoint(connectionId,operation="ping"){
 if(!UUID.test(connectionId)||!["ping","carts"].includes(operation))
  return null;
 return TAXCLOUD_ORIGIN+"/tax/connections/"+connectionId+"/"+operation;
}
