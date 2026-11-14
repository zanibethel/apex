/**
 * Bounded, credential-free production WAF verification. This is deliberately
 * *not* an end-to-end order test: live retail order admission must be OFF.
 *
 * - Exact owned domain and endpoint; no query parameters or redirects
 * - GET should return 405 (POST-only)
 * - POST must return 503 until the per-IP WAF returns 429
 * - Never send buyer details, cookies, auth, real carts or secrets
 * - Maximum 22 POSTs, sequentially from a single ephemeral CI runner
 * - Any unexpected response aborts immediately
 */
const target="https://apexanabolics.co/api/checkout/nonpayable/v1";
if(process.env.CI!=="true"||
  process.env.APEX_DISABLED_WAF_SMOKE!=="nonpayable-only-max-22"){
 throw new Error("Disabled-checkout WAF test may run only in explicitly authorized CI");
}
async function request(method){
 const response=await fetch(target,{
  method,redirect:"manual",cache:"no-store",
  headers:{
   "Accept":"application/json",
   "Cache-Control":"no-store",
   ...(method==="POST"?{"Origin":"https://apexanabolics.co",
     "Content-Type":"application/json"}:{}),
  },
  ...(method==="POST"?{body:"{}"}:{}),
  signal:AbortSignal.timeout(10000),
 });
 const status=response.status;
 await response.body?.cancel();
 return status;
}
const get=await request("GET");
if(get!==405)throw new Error(
 "Expected GET=405 for the production disabled-checkout route; got "+get
);
let triggeredAt=null;
for(let i=1;i<=22;i++){
 const code=await request("POST");
 if(code===429){triggeredAt=i;break;}
 if(code!==503)throw new Error(
  "Disabled-checkout invariant violated or edge response unexpected: POST #"+i+" status="+code
 );
}
if(triggeredAt===null)throw new Error(
 "WAF did not return 429 within 22 bounded, non-customer POSTs; inspect rate-limit rule/region before release"
);
process.stdout.write("PASS: GET 405, disabled POST 503 until WAF 429; first observed WAF throttle at request "+
 triggeredAt+" of at most 22. No customer identity or orders involved.\\n");
