"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {visibleNoticeAt} from "@/lib/announcements/notice-visibility.mjs";
import "./storefront-notice-rotator.css";

export type StorefrontNotice={
 id:string;headline:string;detail:string;href:string|null;
 starts_at:string|null;ends_at:string|null;
};
const safeNotice=(value:unknown):value is StorefrontNotice=>{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const n=value as Record<string,unknown>;
 return typeof n.id==="string"&&typeof n.headline==="string"&&n.headline.length<=120&&
  typeof n.detail==="string"&&n.detail.length<=240&&
  (n.href===null||n.href==="/"||n.href==="/catalog")&&
  (n.starts_at===null||typeof n.starts_at==="string")&&
  (n.ends_at===null||typeof n.ends_at==="string");
};
export function StorefrontNoticeRotator({notices}:{notices:unknown}){
 const path=usePathname();
 const [now,setNow]=useState(0);
 const [index,setIndex]=useState(0);
 const [reduceMotion,setReduceMotion]=useState(true);
 useEffect(()=>{
  const media=window.matchMedia("(prefers-reduced-motion: reduce)");
  const update=()=>setReduceMotion(media.matches);
  update();media.addEventListener("change",update);
  setNow(Date.now());
  return ()=>media.removeEventListener("change",update);
 },[]);
 useEffect(()=>{
  const timer=window.setInterval(()=>{setNow(Date.now());if(!reduceMotion)setIndex(x=>x+1);},7000);
  return ()=>window.clearInterval(timer);
 },[reduceMotion]);
 if(!(path==="/"||path==="/catalog")||!Array.isArray(notices)||!now)return null;
 const active=notices.filter(safeNotice).filter(n=>visibleNoticeAt(n,now));
 if(!active.length)return null;
 const current=active[index%active.length];
 if(!current)return null;
 return <section className="apex-notice-rotator" aria-label="Store announcements">
  <div className="container apex-notice-rotator-inner">
   {active.length>1&&<button type="button" onClick={()=>setIndex(x=>x+active.length-1)}
     aria-label="Previous announcement">‹</button>}
   <div key={current.id} className="apex-notice-rotator-copy" aria-live="off">
    <strong>{current.headline}</strong>
    {current.detail&&<span>{current.detail}</span>}
    {current.href&&<Link href={current.href}>Explore</Link>}
   </div>
   {active.length>1&&<button type="button" onClick={()=>setIndex(x=>x+1)}
     aria-label="Next announcement">›</button>}
  </div>
  {active.length>1&&<div className="apex-notice-rotator-dots" aria-label="Announcement position">
   {active.map((n,i)=><button key={n.id} type="button"
    aria-label={"Show announcement "+(i+1)} aria-current={index%active.length===i}
    onClick={()=>setIndex(i)}/>)}
  </div>}
 </section>;
}
