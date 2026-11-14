import {NextRequest,NextResponse} from "next/server";
import {createSupplierServerClient} from "@/lib/supabase/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
const BASE="https://apexanabolics.co";
function finish(success:boolean){
 // Never redirect using caller-controlled host, next/redirect query, or
 // request headers. Strip one-time secrets from the next URL.
 const url=BASE+(success?"/account/verified?status=confirmed":
  "/account/verified?status=invalid");
 const response=NextResponse.redirect(url,{status:303});
 response.headers.set("Cache-Control","private, no-store");
 response.headers.set("Referrer-Policy","no-referrer");
 response.headers.set("X-Robots-Tag","noindex, nofollow");
 return response;
}
const HASH=/^[A-Za-z0-9_-]{16,512}$/;
export async function GET(request:NextRequest){
 const params=request.nextUrl.searchParams;
 const tokenHash=params.get("token_hash");
 const code=params.get("code");
 const type=params.get("type");
 // Support email template's token_hash (cross-browser) and Supabase's
 // standard PKCE ?code callback (same browser). Never accept arbitrary next.
 if((tokenHash&&code)||(!tokenHash&&!code)||
    (tokenHash&&(type!=="email"||!HASH.test(tokenHash)))||
    (code&&!HASH.test(code)))return finish(false);
 const client=await createSupplierServerClient();
 if(!client)return finish(false);
 try{
  const result=tokenHash?
   await client.auth.verifyOtp({type:"email",token_hash:tokenHash}):
   await client.auth.exchangeCodeForSession(code!);
  if(result.error)return finish(false);
  const {data,error}=await client.auth.getUser();
  return finish(!error&&Boolean(data.user&&
   data.user.is_anonymous!==true&&data.user.email_confirmed_at));
 }catch{return finish(false);}
}
