// Apex private image-copy worker and no-cache, revocable image delivery.
// Deploy to Supabase Edge with verify_jwt=false: POST authenticates JWT using
// Auth.getUser; GET is public only after DB's two hard release gates authorize.
// The service-role secret is supplied by Supabase Edge, NEVER Vercel/browser.
import {createClient} from "npm:@supabase/supabase-js@2.118.0";

const url=Deno.env.get("SUPABASE_URL")??"";
const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const service=url&&secret?createClient(url,secret,{
 auth:{persistSession:false,autoRefreshToken:false},
}):null;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/;
const SRC_BUCKET="apex-draft-product-images";
const DEST_BUCKET="apex-approved-product-images-v1";
const LIMIT=3145728;

function denied(status=404){
 return new Response(JSON.stringify({state:"unavailable"}),{
  status,headers:{"Content-Type":"application/json","Cache-Control":"private, no-store",
   "X-Content-Type-Options":"nosniff"},
 });
}
function validId(v:unknown):v is string{
 return typeof v==="string"&&UUID.test(v);
}
function mimeFor(ext:string):string|null{
 return ext==="png"?"image/png":ext==="jpg"?"image/jpeg":
  ext==="webp"?"image/webp":null;
}
function fileIsValid(bytes:Uint8Array,mime:string){
 if(bytes.length<12||bytes.length>LIMIT)return false;
 if(mime==="image/png")return bytes[0]===137&&bytes[1]===80&&
  bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&
  bytes[6]===26&&bytes[7]===10;
 if(mime==="image/jpeg")return bytes[0]===255&&bytes[1]===216&&
  bytes[2]===255;
 if(mime==="image/webp")return String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&
  String.fromCharCode(...bytes.slice(8,12))==="WEBP";
 return false;
}
async function readBytes(blob:Blob){
 if(blob.size<12||blob.size>LIMIT)return null;
 const b=new Uint8Array(await blob.arrayBuffer());
 return b.length>=12&&b.length<=LIMIT?b:null;
}
async function sha256(bytes:Uint8Array){
 const buffer=new Uint8Array(bytes.length);
 buffer.set(bytes);
 const hash=await crypto.subtle.digest("SHA-256",buffer.buffer);
 return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
function validAsset(key:unknown,productId:string,versionId:string,digest:string){
 if(typeof key!=="string"||key.length>260||!SHA.test(digest))return null;
 const match=key.match(/^media\/v1\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f]{64})\.(png|jpg|webp)$/);
 if(!match||!validId(match[1])||match[2]!==productId||
  match[3]!==versionId||match[4]!==digest)return null;
 const mime=mimeFor(match[5]);
 return mime?{mime}:null;
}
async function getAsset(req:Request,productId:string){
 if(!service||!validId(productId)||req.method!=="GET")return denied();
 const {data,error}=await service.rpc("apex_media_resolve_v1",{
  p_product:productId,
 });
 if(error||!data||typeof data!=="object")return denied();
 const resolved=data as Record<string,unknown>;
 const versionId=resolved.version_id,assetKey=resolved.asset_key,digest=resolved.sha256;
 if(!validId(versionId)||typeof digest!=="string"||typeof assetKey!=="string")
  return denied();
 const asset=validAsset(assetKey,productId,versionId,digest);
 if(!asset)return denied();
 const object=await service.storage.from(DEST_BUCKET).download(assetKey);
 if(object.error||!object.data)return denied();
 const bytes=await readBytes(object.data);
 if(!bytes||!fileIsValid(bytes,asset.mime)||await sha256(bytes)!==digest)
  return denied();
 return new Response(bytes,{
  status:200,headers:{"Content-Type":asset.mime,
   "Content-Length":String(bytes.length),"Cache-Control":"private, no-store, max-age=0",
   "X-Content-Type-Options":"nosniff",
   "Content-Security-Policy":"default-src 'none'; sandbox"},
 });
}
async function issue(req:Request){
 if(!service||req.method!=="POST")return denied(404);
 const bearer=req.headers.get("authorization")??"";
 const token=bearer.match(/^Bearer (\S{24,})$/i)?.[1];
 if(!token)return denied(403);
 const {data:auth,error:authError}=await service.auth.getUser(token);
 const user=auth?.user;
 if(authError||!user||user.is_anonymous||
  !user.email_confirmed_at||user.app_metadata?.apex_role!=="platform_admin")
  return denied(403);
 const length=Number(req.headers.get("content-length")??"0");
 if(length>1500)return denied(413);
 let form:unknown;
 try{
  const body=await req.text();
  if(body.length>1500)return denied(413);
  form=JSON.parse(body);
 }catch{return denied(400);}
 if(!form||typeof form!=="object"||Array.isArray(form))return denied(400);
 const f=form as Record<string,unknown>;
 if(Object.keys(f).length!==4||
  !["storeId","productId","submissionId","evidenceId"].every(k=>validId(f[k])))
  return denied(400);
 const storeId=f.storeId as string,productId=f.productId as string;
 const submissionId=f.submissionId as string,evidenceId=f.evidenceId as string;
 const pre=await service.rpc("apex_media_issue_preflight_v1",{
  p_store:storeId,p_product:productId,p_submission:submissionId,
  p_evidence:evidenceId,
 });
 if(pre.error||!pre.data||typeof pre.data!=="object")return denied(409);
 const verified=pre.data as Record<string,unknown>;
 const path=verified.source_image_path;
 if(verified.store_id!==storeId||verified.product_id!==productId||
  verified.submission_id!==submissionId||verified.evidence_id!==evidenceId||
  typeof path!=="string"||path.length>180||
  !path.startsWith(storeId+"/"+productId+"/"))return denied(409);
 const file=path.slice((storeId+"/"+productId+"/").length);
 if(!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(file))return denied(409);
 const ext=file.split(".").at(-1)??"";
 const mime=mimeFor(ext);
 if(!mime)return denied(409);
 const source=await service.storage.from(SRC_BUCKET).download(path);
 if(source.error||!source.data)return denied(409);
 const bytes=await readBytes(source.data);
 if(!bytes||!fileIsValid(bytes,mime))return denied(409);
 const digest=await sha256(bytes);
 const versionId=crypto.randomUUID();
 const assetKey="media/v1/"+storeId+"/"+productId+"/"+versionId+"/"+digest+"."+ext;
 const copy=await service.storage.from(DEST_BUCKET).upload(assetKey,bytes,{
  contentType:mime,upsert:false,cacheControl:"0",
 });
 if(copy.error)return denied(409);
 const readback=await service.storage.from(DEST_BUCKET).download(assetKey);
 const copied=readback.data?await readBytes(readback.data):null;
 if(readback.error||!copied||!fileIsValid(copied,mime)||
  await sha256(copied)!==digest)return denied(409);
 // Final DB transaction serializes on product and RECHECKS the submission,
 // evidence, authorization, and current image after the object copy.
 const saved=await service.rpc("apex_media_issue_v1",{
  p_store:storeId,p_product:productId,p_submission:submissionId,
  p_evidence:evidenceId,p_version:versionId,p_sha256:digest,p_actor:user.id,
 });
 if(saved.error||!saved.data||saved.data.version_id!==versionId||
  saved.data.asset_key!==assetKey)return denied(409);
 return new Response(JSON.stringify({ok:true,versionId,sha256:digest}),{
  status:201,headers:{"Content-Type":"application/json","Cache-Control":"private, no-store",
   "X-Content-Type-Options":"nosniff"},
 });
}
Deno.serve(async req=>{
 try{
  const parts=new URL(req.url).pathname.split("/").filter(Boolean);
  const suffix=parts.slice(-2);
  if(suffix[0]==="asset"&&validId(suffix[1])&&req.method==="GET")
   return await getAsset(req,suffix[1]);
  if(parts.at(-1)==="issue"&&req.method==="POST")return await issue(req);
  return denied();
 }catch{return denied();}
});
