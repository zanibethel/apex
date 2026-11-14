import {NextRequest,NextResponse} from "next/server";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {buildControlledCartQaReview} from "@/lib/cart/controlled-cart-qa.mjs";

// Authorized internal diagnostic only. NEVER routes to real cart admission,
// the private retail order engine, a live inventory table, or BTCPay.
export const dynamic="force-dynamic";
const HEADERS={"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"};
const deny=(status:number,reason:string)=>NextResponse.json({
 ok:false,reason,canPlaceOrder:false,canPay:false,
},{status,headers:HEADERS});

export async function POST(request:NextRequest){
 const origin=request.headers.get("origin");
 if(origin&&origin!==new URL(request.url).origin)
  return deny(403,"Test request unavailable");
 const client=await createSupplierServerClient();
 if(!client)return deny(401,"Administrator sign-in required");
 const {data,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(data.user))
  return deny(403,"Verified platform administrator access required");
 if(request.headers.get("content-type")?.split(";")[0]!=="application/json")
  return deny(415,"Invalid request");
 let payload:unknown;
 try{
  const raw=await request.text();
  if(raw.length>700)return deny(413,"Test cart too large");
  payload=JSON.parse(raw);
 }catch{return deny(400,"Invalid test cart");}
 if(!payload||typeof payload!=="object"||Array.isArray(payload))
  return deny(400,"Invalid test cart");
 const fields=payload as Record<string,unknown>;
 if(Object.keys(fields).length!==3||
  Object.keys(fields).some(k=>!["items","code","boxSize"].includes(k)))
  return deny(400,"Invalid test cart");
 const review=buildControlledCartQaReview({
  items:fields.items,code:fields.code,boxSize:fields.boxSize,
 });
 if(!review.ok)return deny(409,review.reason);
 // The response has no invoice, inventory reservations, PII, or wallet data.
 return NextResponse.json({...review,synthetic:true,availableUnits:4},{
  status:200,headers:HEADERS,
 });
}

export async function GET(){
 return deny(405,"Quote test requires a POST");
}
