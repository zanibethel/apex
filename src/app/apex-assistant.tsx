"use client";
import {useState,type FormEvent} from "react";
import Link from "next/link";
import {SupplierChatCsvTools} from "./supplier/catalog/chat-csv-tools";
import "./apex-assistant.css";

type Action="publish"|"unpublish";
type Item={
 id?:string;name:string;price:string;availability:string;href:string;
 sku?:string;requested?:boolean;held?:boolean;action?:Action|null;
 productUpdatedAt?:string;controlChangedAt?:string|null;
};
type Message={id:number;from:"user"|"assistant";text:string;items?:Item[];link?:string;tool?:"csv_template"|"csv_import"};
const safeLink=(value:unknown):value is string=>
 typeof value==="string"&&(
  ["/catalog","/supplier","/account/sign-in","/supplier/orders","/cart","/supplier/catalog/bulk","/supplier/catalog/bulk?new=1#apex-product-workspace"].includes(value)||
  /^\/supplier\/catalog\/preview\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
 );
const linkLabel=(link:string)=>link==="/supplier/catalog/bulk?new=1#apex-product-workspace"?"Add a product":
 link==="/supplier/catalog/bulk"?"Manage products":
 link==="/supplier"?"Open supplier workspace":link==="/account/sign-in"?"Account sign in":
 link==="/supplier/orders"?"Supplier orders":link==="/cart"?"View cart":"Browse catalog";

export function ApexAssistant({supplierCanManage=false}:{supplierCanManage?:boolean}){
 const [open,setOpen]=useState(false);
 const [draft,setDraft]=useState("");
 const [sending,setSending]=useState(false);
 const [pending,setPending]=useState<{item:Item;action:Action}|null>(null);
 const [messages,setMessages]=useState<Message[]>([
  {id:0,from:"assistant",text:supplierCanManage
   ?"Supplier catalog assistant ready. Ask me to add a product, review saved products, request publication, download a CSV template or upload a CSV. CSV imports create private drafts; public release remains separate."
   :"Hi! I can look up approved Apex products, listed prices, and basic site information. No purchases or catalog changes here."},
 ]);
 function append(message:Message){
  setMessages(current=>[...current.slice(-19),message]);
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const message=draft.trim().slice(0,300);
  if(!message||sending)return;
  setDraft("");
  setPending(null);
  setSending(true);
  const id=Date.now();
  append({id,from:"user",text:message});
  try{
   const response=await fetch(supplierCanManage?"/api/assistant/supplier":"/api/assistant",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(supplierCanManage?{operation:"ask",message}:{message}),cache:"no-store",
   });
   const data:unknown=await response.json();
   if(!response.ok){
    const error=data&&typeof data==="object"&&(data as {error?:unknown}).error;
    throw new Error(typeof error==="string"?error:"The assistant is busy right now. Please try again.");
   }
   if(!data||typeof data!=="object"||typeof (data as {answer?:unknown}).answer!=="string")
    throw new Error("The assistant couldn't respond. Please try again.");
   const result=data as {answer:string;items?:Item[];link?:string;tool?:string};
   append({
    id:id+1,from:"assistant",text:result.answer.slice(0,1200),
    items:Array.isArray(result.items)?result.items.slice(0,4):[],
    link:safeLink(result.link)?result.link:undefined,
    tool:supplierCanManage&&(result.tool==="csv_template"||result.tool==="csv_import")?result.tool:undefined,
   });
  }catch(error){
   append({id:id+1,from:"assistant",text:error instanceof Error?error.message:"The assistant is currently unavailable."});
  }finally{setSending(false);}
 }
 async function confirm(){
  if(!pending||!supplierCanManage||sending)return;
  const {item,action}=pending;
  if(!item.id||!item.productUpdatedAt||typeof item.requested!=="boolean")return;
  setSending(true);
  setPending(null);
  try{
   const response=await fetch("/api/assistant/supplier",{
    method:"POST",headers:{"Content-Type":"application/json"},
    cache:"no-store",
    body:JSON.stringify({
     operation:"confirm",action,productId:item.id,
     expectedRequested:item.requested,
     productUpdatedAt:item.productUpdatedAt,
     controlChangedAt:item.controlChangedAt??null,
    }),
   });
   const data:unknown=await response.json();
   if(!response.ok){
    const error=data&&typeof data==="object"&&(data as {error?:unknown}).error;
    throw new Error(typeof error==="string"?error:"Publication request was not saved.");
   }
   if(!data||typeof data!=="object"||(data as {ok?:unknown}).ok!==true||
     typeof (data as {answer?:unknown}).answer!=="string")
    throw new Error("Could not verify the publication response. Check the Products workspace.");
   const answer=(data as {answer:string}).answer;
   const id=Date.now();
   setMessages(current=>[
    ...current.slice(-19).map(m=>({...m,items:m.items?.map(i=>i.id===item.id?{
      ...i,action:null,requested:action==="publish",
    }:i)})),
    {id,from:"assistant",text:answer.slice(0,1200),link:"/supplier/catalog/bulk"},
   ]);
  }catch(error){
   append({id:Date.now(),from:"assistant",text:error instanceof Error?error.message:"Could not save request."});
  }finally{setSending(false);}
 }
 return <section className="apex-assistant" aria-label="Apex assistant">
  {open&&<div className="apex-assistant-panel" role="region" aria-label="Apex chat messages">
   <div className="apex-assistant-head">
    <div><strong>{supplierCanManage?"Supplier Catalog Assistant":"Apex Assistant"}</strong><small>Powered by CoOperative Chat</small></div>
    <button type="button" onClick={()=>{setOpen(false);setPending(null);}} aria-label="Close assistant">×</button>
   </div>
   <div className="apex-assistant-thread" role="log" aria-live="polite" aria-relevant="additions text">
    {messages.map((message,index)=><div key={index} className={"apex-assistant-message "+message.from}>
     <p>{message.text}</p>
     {message.items?.map(item=><div key={item.href} className="apex-assistant-item">
      {safeLink(item.href)?<Link href={item.href}>{item.name}</Link>:<strong>{item.name}</strong>}
      <span>{item.sku?"SKU "+item.sku+" · ":""}{item.price} · {item.availability}</span>
      {supplierCanManage&&item.id&&<small>{item.held?"Admin review/hold applies · ":""}
        {item.requested?"Supplier publication requested · Not public":"Private saved product · Not public"}</small>}
      {supplierCanManage&&item.action&&!pending&&<button
       type="button" className="apex-assistant-item-action" disabled={sending}
       onClick={()=>setPending({item,action:item.action!})}>
       {item.action==="publish"?"Review publish request":"Review unpublish request"}
      </button>}
     </div>)}
     {supplierCanManage&&message.tool&&<SupplierChatCsvTools uploadEnabled={message.tool==="csv_import"}/>}
     {message.link&&<Link className="apex-assistant-more" href={message.link}>
      {linkLabel(message.link)} →
     </Link>}
    </div>)}
    {pending&&<div className="apex-assistant-confirm" role="group" aria-label="Confirm supplier listing request">
     <strong>{pending.action==="publish"?"Request publication":"Withdraw publication request"}?</strong>
     <p>{pending.item.name}</p>
     <p>{pending.action==="publish"
      ?"This saves the supplier's preference only. The product will NOT become publicly visible until separate release checks pass."
      :"This withdraws the supplier request. Public release is not controlled by this chat."}</p>
     <div>
      <button type="button" disabled={sending} onClick={confirm}>{sending?"Saving…":"Confirm request"}</button>
      <button type="button" disabled={sending} onClick={()=>setPending(null)}>Cancel</button>
     </div>
    </div>}
    {sending&&<p className="apex-assistant-thinking" role="status">Checking your request…</p>}
   </div>
   {supplierCanManage&&<div className="apex-assistant-csv-shortcut">
    <button type="button" disabled={sending} onClick={()=>append({id:Date.now(),from:"assistant",text:"CSV import tools are ready. Download a template or select a completed CSV to preview before saving private supplier drafts.",tool:"csv_import"})}>CSV upload / template</button>
   </div>}
   <form onSubmit={submit} className="apex-assistant-form">
    <label htmlFor="apex-assistant-input" className="apex-assistant-sr">Ask Apex a question</label>
    <input id="apex-assistant-input" value={draft} maxLength={300} disabled={sending}
     placeholder={supplierCanManage?"Ask about products, publishing or CSV…":"Ask about products or the site…"}
     onChange={event=>setDraft(event.target.value)}/>
    <button type="submit" disabled={!draft.trim()||sending} aria-label="Send message">↑</button>
   </form>
   <p className="apex-assistant-foot">{supplierCanManage
    ?"Supplier-only · Changes require confirmation · Public release separate"
    :"Public catalog only · Avoid entering personal details"}</p>
  </div>}
  <button type="button" className="apex-assistant-toggle"
   aria-expanded={open} aria-label={open?"Close Apex assistant":"Open Apex assistant"}
   onClick={()=>setOpen(value=>!value)}>{open?"×":"Chat"}</button>
 </section>;
}
