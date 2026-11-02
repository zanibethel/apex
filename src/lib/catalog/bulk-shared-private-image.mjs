// Bulk private image copying, with each destination getting its OWN object
// path. These files are only draft placeholders, not evidence of authenticity.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function planPrivateSharedImageCopy(sourceProductId,products){
 if(!UUID.test(sourceProductId)||!Array.isArray(products)||
  products.length<1||products.length>250)return [];
 const seen=new Set();
 return products.filter(p=>{
  if(!p||typeof p!=="object"||!UUID.test(p.productId)||
    p.productId===sourceProductId||p.hasImage===true||
    seen.has(p.productId))return false;
  seen.add(p.productId);
  return true;
 }).map(p=>p.productId);
}
export async function copyPrivateImageBatch({
 ids,authorize,download,upload,attach,onProgress,concurrency=3,
}){
 if(!Array.isArray(ids)||ids.length<1||ids.length>249||
  new Set(ids).size!==ids.length||ids.some(id=>!UUID.test(id))||
  !Number.isSafeInteger(concurrency)||concurrency<1||concurrency>4)
  throw Error("Choose 1–249 distinct product IDs and no more than four workers.");
 const first=await authorize(ids[0]);
 if(!first?.ok||typeof first.sourcePath!=="string"||
  !first.path||!first.token||!first.mime)
  return {completed:[],failed:[{id:ids[0],message:"Unable to access the reference image."}],
   notAttempted:ids.slice(1)};
 const sourcePath=first.sourcePath;
 const blob=await download(sourcePath);
 if(!blob||!Number.isSafeInteger(blob.size)||blob.size<1||blob.size>3145728)
  throw Error("The private reference image must be between 1 byte and 3 MB.");
 const completed=[];
 const failed=[];
 let cursor=0,halted=false;
 async function work(){
  while(!halted){
   const i=cursor++;
   if(i>=ids.length)return;
   const id=ids[i];
   try {
    const permission=i===0?first:await authorize(id);
    if(!permission?.ok||!permission.path||!permission.token||
     !permission.mime||permission.sourcePath!==sourcePath){
     // A changed source image must not silently mix two different photos.
     if(permission?.sourcePath&&permission.sourcePath!==sourcePath)halted=true;
     throw Error("Unable to authorize this copy or the reference image changed.");
    }
    await upload(permission.path,permission.token,blob,permission.mime);
    await attach(id,permission.path);
    completed.push(id);
   }catch(e){
    failed.push({id,message:e instanceof Error?e.message:"Image copy failed."});
   }
   onProgress?.({done:completed.length+failed.length,success:completed.length,
    failed:failed.length,total:ids.length});
  }
 }
 await Promise.all(Array.from({length:Math.min(concurrency,ids.length)},()=>work()));
 const attempted=new Set([...completed,...failed.map(f=>f.id)]);
 return {completed,failed,notAttempted:ids.filter(id=>!attempted.has(id))};
}
