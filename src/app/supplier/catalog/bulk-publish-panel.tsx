"use client";

import {useActionState,useState} from "react";
import {saveBulkPublicationRequests} from "./bulk-actions";

type Publishable={
 id:string;name:string;canRequest:boolean;wantsListing:boolean;
};
type Result={ok:boolean;message:string;results:{id:string;ok:boolean;message:string}[]};

export function BulkPublishPanel({storeId,editable,products}:{
 storeId:string;editable:boolean;products:Publishable[];
}){
 const [selected,setSelected]=useState<string[]>(products.filter(p=>p.canRequest&&!p.wantsListing).map(p=>p.id));
 const [result,action,pending]=useActionState(saveBulkPublicationRequests,
  {ok:false,message:"",results:[]} as Result);
 const allEligible=products.filter(p=>p.canRequest&&!p.wantsListing).map(p=>p.id);
 const chosen=selected.filter(id=>allEligible.includes(id));
 const limit=50;
 const statuses=new Map(result.results.map(r=>[r.id,r]));
 return <section className="apex-bulk-publish" aria-label="Bulk publication requests">
  <div className="apex-bulk-publish-header">
   <h2>Publish offers</h2>
   <p className="notice">Choose individual saved offers or submit all eligible ones. Each product is checked independently. An admin hold takes priority. Requests are private until the separate public release gate is enabled.</p>
  </div>
  <div className="apex-bulk-publish-list">
   {products.map(p=>{
    const eligible=p.canRequest&&!p.wantsListing;
    const outcome=statuses.get(p.id);
    return <label key={p.id} className="apex-bulk-publish-row">
     <input type="checkbox" checked={eligible&&selected.includes(p.id)}
      onChange={e=>setSelected(prev=>e.target.checked?[...prev,p.id]:prev.filter(id=>id!==p.id))}
      disabled={!editable||!eligible||pending}/>
     <span><strong>{p.name}</strong>
      <small>{p.wantsListing?"Request already saved":!p.canRequest?"Needs details or admin release":"Ready to request"}</small>
      {outcome&&<small role="status" className={outcome.ok?"apex-bulk-saved":"apex-bulk-error"}>{outcome.message}</small>}
     </span>
    </label>;
   })}
  </div>
  <div className="apex-bulk-publish-actions">
   <form action={action}>
    <input type="hidden" name="storeId" value={storeId}/>
    <input type="hidden" name="ids" value={chosen.slice(0,limit).join(",")}/>
    <button type="submit" className="button secondary"
     disabled={!editable||pending||chosen.length<1||chosen.length>limit}>
      {pending?"Saving requests…":"Publish selected ("+chosen.length+")"}
    </button>
   </form>
   <form action={action}>
    <input type="hidden" name="storeId" value={storeId}/>
    <input type="hidden" name="ids" value={allEligible.slice(0,limit).join(",")}/>
    <button type="submit" className="button primary"
     disabled={!editable||pending||allEligible.length<1||allEligible.length>limit}>
      {pending?"Saving requests…":"Publish all ("+allEligible.length+")"}
    </button>
   </form>
  </div>
  {allEligible.length>limit&&<p role="status" className="notice">Choose a smaller selection; publication batches are limited to 50 products.</p>}
  {result.message&&<p role="status" className="apex-bulk-result">{result.message}</p>}
 </section>;
}
