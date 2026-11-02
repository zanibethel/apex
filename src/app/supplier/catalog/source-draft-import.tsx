"use client";
import {useMemo,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {createPrivateSourceCards} from "./source-draft-actions";
import {formatPrivatePreviewUsd} from "@/lib/catalog/sold-out-import-pricing.mjs";

type Source={id:string;sourceIndex:number;name:string;strength:string;
 costCents:number;eligible:boolean};
export function SourceDraftImport({storeId,sources,enabled}:{storeId:string; sources:Source[];enabled:boolean}){
 const router=useRouter();
 const eligible=useMemo(()=>sources.filter(s=>s.eligible),[sources]);
 const [selected,setSelected]=useState<string[]>(eligible.map(s=>s.id));
 const [working,startTransition]=useTransition();
 const [status,setStatus]=useState("");
 const chosen=eligible.filter(s=>selected.includes(s.id));
 const allSelected=eligible.length>0&&chosen.length===eligible.length;

 function createCards(){
  if(!enabled||working||!chosen.length)return;
  const original=chosen.map(s=>s.id);
  startTransition(async()=>{
   let confirmed:string[]=[];
   let issue="";
   try{
    for(let offset=0;offset<original.length;offset+=10){
     const batch=original.slice(offset,offset+10);
     const data=new FormData();
     data.set("storeId",storeId);
     data.set("candidateIds",JSON.stringify(batch));
     const result=await createPrivateSourceCards(data);
     confirmed=[...confirmed,...result.results.filter(r=>r.ok).map(r=>r.candidateId)];
     setStatus(`${confirmed.length}/${original.length} private cards saved…`);
     if(!result.ok){issue=result.message;break;}
    }
   }catch{issue="Connection interrupted. Refresh to see which cards saved.";}
   setSelected(prev=>prev.filter(id=>!confirmed.includes(id)));
   setStatus(issue
    ?`${confirmed.length}/${original.length} saved. ${issue}`
    :`${confirmed.length} private product cards created at zero stock. No listings were published.`);
   router.refresh();
  });
 }
 return <section className="apex-source-quick-import" aria-label="Import supplier source records">
  <div className="apex-source-quick-heading">
   <div>
    <p className="eyebrow">EXISTING SOURCE RECORDS</p>
    <h2>Prepare imported product cards</h2>
    <p className="notice">Create editable private cards now, without marking unverified
     suppliers or products approved. Generated SKUs, descriptions and provisional
     pricing will be saved; actual stock starts at zero.</p>
   </div>
   <strong>{eligible.length} to prepare</strong>
  </div>
  {!eligible.length?<p role="status" className="notice">All usable imports are already saved,
    or source names/costs require correction.</p>:<>
   <div className="apex-source-quick-actions">
    <label><input type="checkbox" checked={allSelected}
     onChange={e=>setSelected(e.target.checked?eligible.map(s=>s.id):[])}
     disabled={!enabled||working}/> Select all eligible ({eligible.length})</label>
    <button className="button primary" type="button" disabled={!enabled||working||!chosen.length}
     onClick={createCards}>{working?"Preparing private cards…":`Create ${chosen.length} private cards`}</button>
   </div>
   <details className="apex-source-quick-details">
    <summary>Choose individual source records ({chosen.length} selected)</summary>
    <div className="apex-source-quick-list">
     {eligible.map(source=><label key={source.id}>
      <input type="checkbox" checked={selected.includes(source.id)}
       disabled={!enabled||working}
       onChange={e=>setSelected(prev=>e.target.checked
        ?[...prev,source.id]:prev.filter(id=>id!==source.id))}/>
      <span><strong>{source.name} — {source.strength}</strong>
       <small>Source #{source.sourceIndex+1} · Cost (unverified): {formatPrivatePreviewUsd(source.costCents)}</small>
      </span>
     </label>)}
    </div>
   </details>
  </>}
  {!enabled&&<p className="notice" role="status">Private source-card creation is not enabled in this environment.</p>}
  {status&&<p role="status" className="notice">{status}</p>}
  <p className="notice">These are private editing records, not approved offers. The proposed
   2× price and 2.5× compare-at price do not establish a real discount.
   Public release remains controlled separately.</p>
 </section>;
}
