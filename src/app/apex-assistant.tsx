"use client";
import {useState,type FormEvent} from "react";
import Link from "next/link";
import "./apex-assistant.css";

type Item={name:string;price:string;availability:string;href:string};
type Message={id:number;from:"user"|"assistant";text:string;items?:Item[];link?:string};
export function ApexAssistant(){
 const [open,setOpen]=useState(false);
 const [draft,setDraft]=useState("");
 const [sending,setSending]=useState(false);
 const [messages,setMessages]=useState<Message[]>([
  {id:0,from:"assistant",text:"Hi! I can look up approved Apex products, listed prices, and basic site information. No purchases or catalog changes here."},
 ]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const message=draft.trim().slice(0,300);
  if(!message||sending)return;
  setDraft("");
  setSending(true);
  const id=Date.now();
  setMessages(current=>[...current,{id,from:"user",text:message}]);
  try{
   const response=await fetch("/api/assistant",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({message}),cache:"no-store",
   });
   const data:unknown=await response.json();
   if(!response.ok)throw new Error("The assistant is busy right now. Please try again.");
   if(!data||typeof data!=="object"||typeof (data as {answer?:unknown}).answer!=="string")
    throw new Error("The assistant couldn't respond. Please try again.");
   const result=data as {answer:string;items?:Item[];link?:string};
   setMessages(current=>[...current.slice(-19),{
    id:id+1,from:"assistant",text:result.answer.slice(0,1200),
    items:Array.isArray(result.items)?result.items.slice(0,4):[],
    link:["/catalog","/supplier"].includes(result.link??"")?result.link:undefined,
   }]);
  }catch(error){
   setMessages(current=>[...current.slice(-19),{
    id:id+1,from:"assistant",
    text:error instanceof Error?error.message:"The assistant is currently unavailable.",
   }]);
  }finally{setSending(false);}
 }
 return <section className="apex-assistant" aria-label="Apex assistant">
  {open&&<div className="apex-assistant-panel" role="region" aria-label="Apex chat messages">
   <div className="apex-assistant-head">
    <div><strong>Apex Assistant</strong><small>Text-only · CoOperative-ready</small></div>
    <button type="button" onClick={()=>setOpen(false)} aria-label="Close assistant">×</button>
   </div>
   <div className="apex-assistant-thread" role="log" aria-live="polite" aria-relevant="additions text">
    {messages.map((message,index)=><div key={index} className={"apex-assistant-message "+message.from}>
     <p>{message.text}</p>
     {message.items?.map(item=><div key={item.href} className="apex-assistant-item">
      <Link href={item.href}>{item.name}</Link>
      <span>{item.price} · {item.availability}</span>
     </div>)}
     {message.link&&<Link className="apex-assistant-more" href={message.link}>
      {message.link==="/supplier"?"Open supplier workspace":"Browse catalog"} →
     </Link>}
    </div>)}
    {sending&&<p className="apex-assistant-thinking" role="status">Checking the approved catalog…</p>}
   </div>
   <form onSubmit={submit} className="apex-assistant-form">
    <label htmlFor="apex-assistant-input" className="apex-assistant-sr">Ask Apex a question</label>
    <input id="apex-assistant-input" value={draft} maxLength={300} disabled={sending}
     placeholder="Ask about products or the site…" onChange={event=>setDraft(event.target.value)}/>
    <button type="submit" disabled={!draft.trim()||sending} aria-label="Send message">↑</button>
   </form>
   <p className="apex-assistant-foot">Public catalog only · No orders or product changes</p>
  </div>}
  <button type="button" className="apex-assistant-toggle"
   aria-expanded={open} aria-label={open?"Close Apex assistant":"Open Apex assistant"}
   onClick={()=>setOpen(value=>!value)}>{open?"×":"Chat"}</button>
 </section>;
}
