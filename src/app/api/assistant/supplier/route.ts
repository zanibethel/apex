import {NextRequest,NextResponse} from "next/server";
import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {answerSupplierCatalogMessage} from "@/lib/chat/supplier-catalog.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
const respond=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:noStore});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const quota=new Map<string,{count:number;until:number}>();
function permitted(id:string){
 const now=Date.now();
 if(quota.size>=500){
  for(const [key,item] of quota)if(item.until<now)quota.delete(key);
  if(quota.size>=500&&!quota.has(id))return false;
 }
 const hit=quota.get(id);
 if(!hit||hit.until<now){quota.set(id,{count:1,until:now+60000});return true;}
 if(hit.count>=25)return false;
 hit.count++;
 return true;
}

async function authorizedStore(){
 const client=await createSupplierServerClient();
 if(!client)return {error:"Supplier sign-in required.",status:401} as const;
 const {data:auth,error}=await client.auth.getUser();
 const user=auth.user;
 if(error||!user||user.is_anonymous||!user.email_confirmed_at)
  return {error:"Supplier sign-in required.",status:401} as const;
 const {data:memberships,error:memberError}=await client.from("supplier_memberships")
  .select("supplier_id,role").in("role",["owner","manager"]).limit(20);
 if(memberError||!memberships?.length)return {error:"Supplier owner or manager access required.",status:403} as const;
 const {data:stores,error:storeError}=await client.from("stores").select("id,supplier_id,is_public")
  .in("supplier_id",memberships.map(x=>x.supplier_id)).eq("is_public",false).limit(20);
 if(storeError||stores?.length!==1)return {
  error:"Select a single authorized private supplier storefront in the Products workspace.",status:409
 } as const;
 return {client,user,store:stores[0]} as const;
}
function originAllowed(request:NextRequest){
 // For cookie-authenticated mutation, browsers must prove same origin.
 const origin=request.headers.get("origin");
 const destination=new URL(request.url);
 const fetchSite=request.headers.get("sec-fetch-site");
 return origin===destination.origin&&(fetchSite===null||fetchSite==="same-origin");
}
type Ask={operation:"ask";message:string};
type Confirm={
 operation:"confirm";action:"publish"|"unpublish";productId:string;
 expectedRequested:boolean;productUpdatedAt:string;controlChangedAt:string|null;
};
type EditConfirm={
 operation:"confirm_edit";editKind:"price"|"stock";productId:string;
 expectedProductUpdatedAt:string;expectedValue:number;targetValue:number;
};
export async function POST(request:NextRequest){
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
  return respond({error:"JSON required."},415);
 if(Number(request.headers.get("content-length")??0)>1500)return respond({error:"Request too large."},413);
 let body:unknown;
 try{const raw=await request.text();if(raw.length>1500)return respond({error:"Request too large."},413);body=JSON.parse(raw);}
 catch{return respond({error:"Invalid request."},400);}
 if(!body||typeof body!=="object"||Array.isArray(body))return respond({error:"Invalid request."},400);
 const data=body as Record<string,unknown>;
 if(data.operation==="ask"){
  if(Object.keys(data).some(k=>!["operation","message"].includes(k))||
    typeof data.message!=="string"||!data.message.trim()||data.message.length>300)
   return respond({error:"Enter a short question."},400);
 }else if(data.operation==="confirm"){
  if(Object.keys(data).some(k=>!["operation","action","productId","expectedRequested","productUpdatedAt","controlChangedAt"].includes(k))||
    !["publish","unpublish"].includes(String(data.action))||
    typeof data.productId!=="string"||!UUID.test(data.productId)||
    typeof data.expectedRequested!=="boolean"||
    typeof data.productUpdatedAt!=="string"||data.productUpdatedAt.length>50||
    !(data.controlChangedAt===null||(typeof data.controlChangedAt==="string"&&data.controlChangedAt.length<=50)))
   return respond({error:"Invalid confirmation."},400);
  if(!originAllowed(request))return respond({error:"Same-origin confirmation required."},403);
 }else if(data.operation==="confirm_edit"){
  if(Object.keys(data).some(k=>!["operation","editKind","productId","expectedProductUpdatedAt","expectedValue","targetValue"].includes(k))||
   !["price","stock"].includes(String(data.editKind))||
   typeof data.productId!=="string"||!UUID.test(data.productId)||
   typeof data.expectedProductUpdatedAt!=="string"||data.expectedProductUpdatedAt.length>50||
   !Number.isSafeInteger(data.expectedValue)||Number(data.expectedValue)<0||
   !Number.isSafeInteger(data.targetValue)||Number(data.targetValue)<0||
   Number(data.targetValue)===Number(data.expectedValue))
   return respond({error:"Invalid product edit confirmation."},400);
  if(!originAllowed(request))return respond({error:"Same-origin confirmation required."},403);
 }else return respond({error:"Invalid operation."},400);

 const context=await authorizedStore();
 if("error" in context)return respond({error:context.error},context.status);
 const {client,user,store}=context;
 if(!permitted(user.id))return respond({error:"Too many requests. Try again shortly."},429);

 if(data.operation==="confirm_edit"){
  if(process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")
   return respond({error:"Supplier product editing is currently disabled."},503);
  const edit=data as EditConfirm;
  const priceChange=edit.editKind==="price";
  if((priceChange&&(edit.targetValue<1||edit.targetValue>999999999||edit.expectedValue<1||edit.expectedValue>999999999))||
     (!priceChange&&(edit.targetValue>1000000||edit.expectedValue>1000000)))
   return respond({error:"Product value is outside the supported range."},400);
  const {data:product,error:productError}=await client.from("products")
   .select("id,name,price_cents,compare_at_price_cents,updated_at,is_published")
   .eq("store_id",store.id).eq("id",edit.productId)
   .eq("is_published",false).is("archived_at",null).maybeSingle();
  if(productError||!product)return respond({error:"Private product unavailable for this supplier."},404);
  if(product.updated_at!==edit.expectedProductUpdatedAt)
   return respond({error:"Product changed since the chat preview. Ask again to get its current values."},409);
  if(priceChange){
   if(Number(product.price_cents)!==edit.expectedValue)
    return respond({error:"Price changed. Ask chat to review the product again."},409);
   if(product.compare_at_price_cents!==null&&edit.targetValue>=Number(product.compare_at_price_cents))
    return respond({error:"The proposed price must be lower than the compare-at price. Update the comparison in Products first."},409);
   const {data:saved,error}=await client.from("products")
    .update({price_cents:edit.targetValue})
    .eq("store_id",store.id).eq("id",product.id).eq("is_published",false).is("archived_at",null)
    .eq("updated_at",edit.expectedProductUpdatedAt).eq("price_cents",edit.expectedValue)
    .select("id").maybeSingle();
   if(error||!saved)return respond({error:"Price could not be saved. Request a fresh review."},409);
  }else{
   const {data:inventory,error:inventoryError}=await client.from("inventory_items")
    .select("quantity_on_hand,quantity_reserved").eq("store_id",store.id)
    .eq("product_id",product.id).maybeSingle();
   if(inventoryError||!inventory)return respond({error:"The stock ledger is unavailable."},409);
   if(inventory.quantity_on_hand!==edit.expectedValue)
    return respond({error:"Stock changed since the chat preview. Ask again before saving."},409);
   if(edit.targetValue<inventory.quantity_reserved)
    return respond({error:"Stock cannot be below already reserved quantities."},409);
   // Existing inventory ledger trigger records the actor and before/after values.
   const {data:saved,error}=await client.from("inventory_items")
    .update({quantity_on_hand:edit.targetValue})
    .eq("store_id",store.id).eq("product_id",product.id)
    .eq("quantity_on_hand",edit.expectedValue)
    .lte("quantity_reserved",edit.targetValue)
    .select("product_id").maybeSingle();
   if(error||!saved)return respond({error:"Stock could not be saved. Request a fresh review."},409);
  }
  for(const path of ["/supplier/catalog","/supplier/catalog/bulk","/supplier/inventory",
   "/supplier/catalog/storefront-test","/admin/catalog-release","/catalog","/cart"])
   revalidatePath(path);
  return respond({ok:true,source:"apex-supplier-code-v1",public:false,
   answer:(priceChange?"Price":"On-hand stock")+" updated for "+product.name+
    (priceChange?" to $"+(edit.targetValue/100).toFixed(2):" to "+edit.targetValue)+
    ". Saved in your private supplier catalog. This did not publish the product or enable checkout.",
   items:[]});
 }
 if(data.operation==="confirm"){
  if(process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")
   return respond({error:"Supplier publication controls are not currently enabled."},503);
  const body=data as Confirm;
  const {data:product,error:productError}=await client.from("products")
   .select("id,store_id,name,category_id,updated_at,is_published,is_active")
   .eq("store_id",store.id).eq("id",body.productId).is("archived_at",null).maybeSingle();
  if(productError||!product||product.is_published)
   return respond({error:"Private product not available for this supplier."},404);
  const {data:listing,error:listingError}=await client.from("supplier_listing_controls")
   .select("supplier_wants_listing,changed_at,admin_gate,republish_approval_required,republish_approved")
   .eq("store_id",store.id).eq("product_id",product.id).maybeSingle();
  if(listingError)return respond({error:"Publication controls are unavailable."},503);
  const requested=listing?.supplier_wants_listing===true;
  const changedAt=listing?.changed_at??null;
  // Fail closed for stale previews or replay; downstream RPC independently
  // authorizes the supplier and checks product completeness/admin holds.
  if(product.updated_at!==body.productUpdatedAt||
     changedAt!==body.controlChangedAt||
     requested!==body.expectedRequested||
     (body.action==="publish"&&requested)||
     (body.action==="unpublish"&&!requested))
   return respond({error:"Product status changed. Review it again before confirming."},409);
  if(body.action==="publish"&&(!product.is_active||
    listing?.admin_gate==="hold"||listing?.admin_gate==="review_required"||
    (listing?.republish_approval_required&&!listing.republish_approved)))
   return respond({error:"Inactive products and admin-held items cannot request publication."},409);
  const {data:retailCategory,error:retailCategoryError}=await client.from("categories")
   .select("slug").eq("store_id",store.id).eq("id",product.category_id).maybeSingle();
  if(retailCategoryError)return respond({error:"Unable to verify this product category."},503);
  const retailShowcase=retailCategory?.slug==="sample-apparel"||retailCategory?.slug==="sample-accessories";
  const result=await client.rpc("set_supplier_listing_intent",{
   p_store_id:store.id,p_product_id:product.id,p_action:body.action,
  });
  if(result.error||!result.data)
   return respond({error:"Publication request was not accepted. Recheck product setup, stock and any admin hold."},409);
  const {data:release,error:releaseError}=await client.rpc("get_private_release_readiness",{
   p_store_id:store.id,p_product_id:product.id,
  });
  revalidatePath("/supplier/catalog");
  revalidatePath("/supplier/catalog/bulk");
  revalidatePath("/supplier/catalog/preview/"+product.id);
  revalidatePath("/admin/catalog-release");
  revalidatePath("/catalog");
  return respond({
   ok:true,source:"apex-supplier-code-v1",
   answer:retailShowcase
    ?(body.action==="publish"
      ?(String(result.data).startsWith("Live retail display enabled")
        ?product.name+" is now on the public Apex retail showcase. It is visible even when sold out; checkout and payments remain unavailable."
        :product.name+" is requested for the retail showcase, but public display is not activated yet.")
      :product.name+" has been removed from the public retail showcase.")
    :(body.action==="publish"
      ?"Publication preference saved for "+product.name+
       ". It is NOT publicly published. Separate release requirements still apply."
      :"Publication request withdrawn for "+product.name+"."),
   public:retailShowcase&&body.action==="publish"&&
    String(result.data).startsWith("Live retail display enabled"),
   statusCode:retailShowcase?(body.action==="unpublish"?"retail_hidden":
     String(result.data).startsWith("Live retail display enabled")?"retail_visible":"retail_pending"):
     releaseError?"unverified":typeof release?.status_code==="string"?release.status_code:"unverified",
   items:[],
  });
 }

 const {data:products,error:productError,count}=await client.from("products")
  .select("id,name,sku,price_cents,compare_at_price_cents,currency,is_active,is_published,updated_at,category_id",{count:"exact"})
  .eq("store_id",store.id).is("archived_at",null).order("name").limit(100);
 if(productError||count===null||count!==products?.length)
  return respond({error:"The complete saved-product list could not be verified."},503);
 const [{data:controls,error:controlError},{data:stock,error:stockError},
        {data:categories,error:categoryError}]=await Promise.all([
  client.from("supplier_listing_controls").select("product_id,supplier_wants_listing,changed_at,admin_gate,republish_approval_required,republish_approved")
   .eq("store_id",store.id).limit(100),
  client.from("inventory_items").select("product_id,quantity_on_hand,quantity_reserved")
   .eq("store_id",store.id).limit(100),
  client.from("categories").select("id,name,slug").eq("store_id",store.id).limit(100),
 ]);
 if(controlError||stockError||categoryError)return respond({error:"Supplier catalog status is temporarily unavailable."},503);
 const controlsById=new Map((controls??[]).map(x=>[x.product_id,x]));
 const stockById=new Map((stock??[]).map(x=>[x.product_id,x]));
 const categoryById=new Map((categories??[]).map(x=>[x.id,x.name]));
 const retailCategories=new Set((categories??[]).filter(x=>x.slug==="sample-apparel"||x.slug==="sample-accessories").map(x=>x.id));
 const projection=(products??[]).map(p=>{
  const control=controlsById.get(p.id);
  const inventory=stockById.get(p.id);
  const availableStock=inventory?Math.max(0,inventory.quantity_on_hand-inventory.quantity_reserved):null;
  return {id:p.id,name:p.name,sku:p.sku,priceCents:Number(p.price_cents),
   compareAtCents:p.compare_at_price_cents===null?null:Number(p.compare_at_price_cents),
   stockOnHand:inventory?.quantity_on_hand??null,stockReserved:inventory?.quantity_reserved??0,
   published:p.is_published,held:control?.admin_gate==="hold"||control?.admin_gate==="review_required",
   currency:p.currency,
   category:categoryById.get(p.category_id??"")??"",active:p.is_active,
   retailShowcase:retailCategories.has(p.category_id??""),
   requested:control?.supplier_wants_listing===true,
   adminGate:control?.admin_gate??"clear",
   republishBlocked:control?.republish_approval_required===true&&control.republish_approved!==true,
   availableStock,productUpdatedAt:p.updated_at,controlChangedAt:control?.changed_at??null};
 });
 return respond(answerSupplierCatalogMessage(data.message as string,projection));
}
export async function GET(){return respond({error:"Method not allowed."},405);}
