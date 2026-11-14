import {NextRequest,NextResponse} from "next/server";
import {APEX_RECOVERY_COOKIE,validRecoveryToken} from "@/lib/auth/password-recovery-v1.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
const BASE="https://apexanabolics.co";
function finish(valid:boolean,token?:string){
 // Email scanners may prefetch a GET. Store the hash in a short-lived,
 // HttpOnly, same-site cookie but consume it only on deliberate form POST.
 const response=NextResponse.redirect(
  BASE+(valid?"/account/reset-password":"/account/reset-password?status=invalid"),
  {status:303});
 response.headers.set("Cache-Control","private, no-store");
 response.headers.set("Referrer-Policy","no-referrer");
 response.headers.set("X-Robots-Tag","noindex, nofollow");
 if(valid&&token){
  response.cookies.set(APEX_RECOVERY_COOKIE,token,{
   httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:900,
  });
 }else{
  response.cookies.delete(APEX_RECOVERY_COOKIE);
 }
 return response;
}
export async function GET(request:NextRequest){
 const p=request.nextUrl.searchParams;
 const hash=p.get("token_hash");
 // No arbitrary destinations or implicit-fragment tokens accepted.
 if(p.get("type")!=="recovery"||!validRecoveryToken(hash))return finish(false);
 return finish(true,hash!);
}
