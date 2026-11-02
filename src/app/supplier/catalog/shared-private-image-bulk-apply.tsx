"use client";
import Image from "next/image";
import {useRouter} from "next/navigation";
import {useMemo,useState} from "react";
import {createBrowserClient} from "@supabase/ssr";
import {requestProductImageReuse,attachProductImage} from "./image-actions";
import {planPrivateSharedImageCopy,copyPrivateImageBatch} from "@/lib/catalog/bulk-shared-private-image.mjs";

type Product={productId:string;hasImage:boolean};
type Source={productId:string;name:string;sku:string;previewUrl:string};

export function SharedPrivateImageBulkApply({storeId,products,sources,enabled}:{
 storeId:string;products:Product[];sources:Source[];enabled:boolean;
}){
 const router=useRouter();
 const [sourceId,setSourceId]=useState(sources.length===1?sources[0].productId:"");
 const [running,setRunning]=useState(false);
 const [progress,setProgress]=useState({done:0,success:0,failed:0,total:0});
 const [report,setReport]=useState("");
 const [failures,setFailures]=useState<string[]>([]);
 const [finishedIds,setFinishedIds]=useState<string[]>([]);
 const source=sources.find(item=>item.productId===sourceId);
 const targets=useMemo(()=>planPrivateSharedImageCopy(sourceId,products)
  .filter(id=>!finishedIds.includes(id)),[sourceId,products,finishedIds]);

 async function applyToAll(){
  if(running||!enabled||!source||!targets.length)return;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key){setReport("Private image storage is not configured.");return;}
  setRunning(true);setReport("");setFailures([]);
  setProgress({done:0,success:0,failed:0,total:targets.length});
  try{
   const storage=createBrowserClient(url,key).storage.from("apex-draft-product-images");
   const outcome=await copyPrivateImageBatch({
    ids:targets,
    authorize:(id:string)=>requestProductImageReuse(storeId,id,sourceId),
    download:async(path:string)=>{
     const {data,error}=await storage.download(path);
     if(error||!data)throw Error("The original private image could not be downloaded.");
     return data;
    },
    upload:async(path:string,token:string,blob:Blob,mime:string)=>{
     const {error}=await storage.uploadToSignedUrl(path,token,blob,{
      contentType:mime,upsert:false,
     });
     if(error)throw Error("Private image copy upload failed.");
    },
    attach:async(id:string,path:string)=>{
     const saved=await attachProductImage(storeId,id,path);
     if(!saved.ok)throw Error("Copy uploaded but product image could not be saved.");
    },
    onProgress:(next:{done:number;success:number;failed:number;total:number})=>
     setProgress(next),
   });
   setFinishedIds(previous=>[...new Set([...previous,...outcome.completed])]);
   const incomplete=outcome.failed.length+outcome.notAttempted.length;
   setReport(`${outcome.completed.length} private images copied. ${incomplete} not completed. No products were published or approved.`);
   setFailures([
    ...outcome.failed.slice(0,5).map(item=>`Product ${item.id.slice(0,8)}: ${item.message}`),
    ...(outcome.notAttempted.length?["Some products were not attempted because the reference image changed."]:[]),
   ]);
   router.refresh();
  }catch(e){
   setReport(e instanceof Error?e.message:"Bulk copy interrupted. Refresh to see completed images.");
   router.refresh();
  }finally{setRunning(false);}
 }
 return <section className="apex-shared-image-apply" aria-label="Apply one existing image to private products">
  <div className="apex-shared-image-heading">
   <div>
    <h2>Use the same image for all private products</h2>
    <p className="notice">This makes a separate private copy for each product missing an image.
     Existing product images are preserved. Price, SKU, description, stock, and
     publishing settings stay unchanged.</p>
   </div>
   <span className="apex-shared-image-count">{targets.length} need an image</span>
  </div>
  {sources.length===0?<p className="notice">Upload one image to a product first; then it can be reused for all private cards.</p>:<>
   <div className="apex-shared-image-controls">
    <label htmlFor="apex-shared-image-source">Reference image from
     <select id="apex-shared-image-source" value={sourceId} disabled={running||!enabled}
      onChange={e=>{setSourceId(e.target.value);setReport("");setFinishedIds([]);}}>
      {sources.length!==1&&<option value="">Select saved image</option>}
      {sources.map(image=><option value={image.productId} key={image.productId}>
       {image.name} · {image.sku}</option>)}
     </select>
    </label>
    {source&&<div className="apex-shared-image-reference">
     <Image src={source.previewUrl} alt="Existing private image selected for reuse"
      width={100} height={80} unoptimized/>
     <small>Private reference: {source.name}</small>
    </div>}
   </div>
   <button type="button" className="button primary"
    disabled={!enabled||running||!source||targets.length===0}
    onClick={applyToAll}>
    {running?"Copying private images…":`Apply image to ${targets.length} products`}
   </button>
  </>}
  {running&&<p role="status" className="notice">
   {progress.done}/{progress.total} processed · {progress.success} saved · {progress.failed} failed
  </p>}
  {report&&<p role="status" className="notice">{report}</p>}
  {failures.length>0&&<details>
   <summary>Review {failures.length} copy issues</summary>
   <ul>{failures.map((item,i)=><li key={i}>{item}</li>)}</ul>
   <p className="notice">Refresh the page to retry only products that still lack an image.</p>
  </details>}
  {!enabled&&<p role="status" className="notice">Private catalog image editing is disabled.</p>}
  <p className="notice">A shared photo is a private placeholder only. It does not verify
   the identity, label, concentration, or image rights of each product and does
   not make any item available to customers.</p>
 </section>;
}
