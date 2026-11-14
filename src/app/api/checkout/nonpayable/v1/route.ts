import {NextResponse} from "next/server";
import pg from "pg";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {createRetailCheckoutServerPoolV1}
 from "@/lib/checkout/retail-db-server-config-v1.mjs";
import {createRetailPostgresAdmissionDependenciesV1}
 from "@/lib/checkout/retail-postgres-admission-dependencies-v1.mjs";
import {admitPrivateNonpayableRetailOrderV1}
 from "@/lib/checkout/retail-nonpayable-admission-controller-v1.mjs";
import {isTrustedNonpayableCheckoutEnvelopeV1}
 from "@/lib/checkout/retail-nonpayable-request-boundary-v1.mjs";
import {isRetailNonpayableSubmissionEnabledV1}
 from "@/lib/checkout/retail-nonpayable-route-release-v1.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
export const maxDuration=20;

const HEADERS={
 "Cache-Control":"private, no-store",
 "X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer",
};
const deny=(status:number,code:string)=>NextResponse.json({
 schemaVersion:1,accepted:false,code,
 canPay:false,canShip:false,invoiceCreated:false,paymentConfirmed:false,
},{status,headers:HEADERS});
const unavailable=()=>deny(503,"NONPAYABLE_CHECKOUT_UNAVAILABLE");

// The legacy /api/checkout/handoff/v1 remains unconditionally disabled.
// This isolated path is not publicly admitting without TWO separate
// operator-owned server-only release settings. DB order engine is also OFF
// independently; this code does not set its state or activate BTCPay.
export async function POST(request:Request){
 if(!isRetailNonpayableSubmissionEnabledV1(process.env))
  return unavailable(); // Do not read buyer body or open a DB connection.

 // Reject CSRF/cross-origin/oversized/unsafe metadata before touching user
 // auth, rate budget, or raw delivery details.
 if(!isTrustedNonpayableCheckoutEnvelopeV1(request))
  return deny(400,"INVALID_CHECKOUT_REQUEST");

 const authClient=await createSupplierServerClient();
 if(!authClient)return unavailable();
 let user;
 try{
  const result=await authClient.auth.getUser();
  if(result.error)return deny(401,"CUSTOMER_AUTH_REQUIRED");
  user=result.data.user;
 }catch{return deny(401,"CUSTOMER_AUTH_REQUIRED");}
 if(!user||user.is_anonymous===true||user.aud!=="authenticated"||
  !user.email_confirmed_at)return deny(401,"CUSTOMER_AUTH_REQUIRED");

 let pool:pg.Pool|undefined;
 try{
  const configured=createRetailCheckoutServerPoolV1(process.env,pg.Pool);
  pool=configured.pool;
  const dependencies=createRetailPostgresAdmissionDependenciesV1({pool});
  const result=await admitPrivateNonpayableRetailOrderV1({
   request,authClient,pool,...dependencies,
   fingerprintKey:configured.fingerprintKey,
   deliveryKeyReference:configured.deliveryKeyReference,
   deliveryKey:configured.deliveryKey,
  });
  if(!result.ok){
   if(result.code==="CUSTOMER_AUTH_REQUIRED")
    return deny(401,result.code);
   if(result.code==="INVALID_CHECKOUT_REQUEST")
    return deny(400,result.code);
   if(result.code==="ADMISSION_RATE_LIMITED")
    return deny(429,result.code);
   return unavailable();
  }
  // Explicitly return an allowlisted nonpayable receipt, not full DB rows,
  // buyer delivery data, source HMAC, ciphertext or payment capability.
  return NextResponse.json({
   schemaVersion:1,accepted:true,orderId:result.orderId,
   status:result.status,createdAt:result.createdAt,
   expiresAt:result.expiresAt,totalCents:result.totalCents,
   currency:result.currency,replayed:result.replayed,
   canPay:false,canShip:false,invoiceCreated:false,
   paymentConfirmed:false,
  },{status:201,headers:HEADERS});
 }catch{
  // Never log or expose PostgreSQL exceptions, order parameters, TLS
  // material, protected customer data or server-only keys.
  return unavailable();
 }finally{
  if(pool){
   try{await pool.end();}catch{}
  }
 }
}

export async function GET(){
 return NextResponse.json({accepted:false,code:"METHOD_NOT_ALLOWED"},{
  status:405,headers:{...HEADERS,Allow:"POST"},
 });
}
