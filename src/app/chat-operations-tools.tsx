"use client";

import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import "./chat-operations-tools.css";

type Store={id:string;name:string};
type Notice={
 id:string;store_id:string|null;headline:string;detail:string;href:string|null;
 starts_at:string|null;ends_at:string|null;is_active:boolean;priority:number;updated_at:string;
};
type Discount={
 id:string;store_id:string;code:string;discount_kind:string;discount_value:number;
 min_subtotal_cents:number;starts_at:string|null;ends_at:string|null;usage_limit:number|null;
 redemption_count:number;is_active:boolean;updated_at:string;
};
type Data={
 ok:boolean;admin:boolean;stores:Store[];storeId:string|null;
 notices:Notice[];noticesReady:boolean;discounts:Discount[];
 discountsReady:boolean;discountsWritable:boolean;
 payouts?:{
  sales:{order_reference:string;sale_state:string;gross_cents:number;currency:string;occurred_at:string}[];
  walletRequests:{label:string;request_state:string;created_at:string}[];
  splitDraft:{supplier_percent:number;updated_at:string}|null;
  salesReady:boolean;walletReady:boolean;splitReady:boolean;
 };
};
type Mode="banners"|"discounts"|"payouts"|"security";
const formatDate=(date:string|null)=>date?new Date(date).toLocaleString():"Any time";
const localValue=(date:string|null)=>{
 if(!date)return "";
 const d=new Date(date);if(!Number.isFinite(d.getTime()))return "";
 const shifted=new Date(d.getTime()-d.getTimezoneOffset()*60000);
 return shifted.toISOString().slice(0,16);
};
const toIso=(value:string)=>{
 if(!value)return null;
 const date=new Date(value);
 return Number.isFinite(date.getTime())?date.toISOString():null;
};
type NoticeDraft={headline:string;detail:string;href:string;startsAt:string;endsAt:string;active:boolean;priority:number};
const emptyNotice:NoticeDraft={headline:"",detail:"",href:"",startsAt:"",endsAt:"",active:true,priority:0};
type DiscountDraft={code:string;kind:string;value:string;minimum:string;usageLimit:string;startsAt:string;endsAt:string;active:boolean};
const emptyDiscount:DiscountDraft={code:"",kind:"percentage",value:"10",minimum:"0.00",usageLimit:"",startsAt:"",endsAt:"",active:true};
function noticeFrom(row:Notice):NoticeDraft{return {
 headline:row.headline,detail:row.detail,href:row.href??"",
 startsAt:localValue(row.starts_at),endsAt:localValue(row.ends_at),
 active:row.is_active,priority:row.priority,
};}
function discountFrom(row:Discount):DiscountDraft{return {
 code:row.code,kind:row.discount_kind,value:row.discount_kind==="fixed"?
 (row.discount_value/100).toFixed(2):String(row.discount_value),
 minimum:(row.min_subtotal_cents/100).toFixed(2),
 usageLimit:row.usage_limit===null?"":String(row.usage_limit),
 startsAt:localValue(row.starts_at),endsAt:localValue(row.ends_at),
 active:row.is_active,
};}
const requestedHeadline=(message:string)=>{
 const match=message.match(/(?:create|add|schedule|post|make)\s+(?:a\s+)?(?:banner|announcement|notice)\s*[:—-]?\s*(.+)/i);
 return match?.[1]?.trim().slice(0,120)??"";
};
const requestedCode=(message:string)=>{
 const match=message.match(/(?:create|add|make)\s+(?:a\s+)?(?:discount|promo|coupon)?\s*(?:code|coupon)\s+([A-Z0-9_-]{3,24})\s+(?:for\s+)?(\d{1,2})%/i);
 return match?{code:match[1].toUpperCase(),value:match[2]}:null;
};
export function ChatOperationsTools({mode,initialMessage="",isAdmin=false}:{
 mode:Mode;initialMessage?:string;isAdmin?:boolean;
}){
 const [data,setData]=useState<Data|null>(null);
 const router=useRouter();
 const [selectedStore,setSelectedStore]=useState("");
 const [noticeScope,setNoticeScope]=useState("global");
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const [editingNotice,setEditingNotice]=useState<string|null>(null);
 const [editingDiscount,setEditingDiscount]=useState<string|null>(null);
 const [notice,setNotice]=useState<NoticeDraft>(()=>({...emptyNotice,headline:requestedHeadline(initialMessage)}));
 const [discount,setDiscount]=useState<DiscountDraft>(()=>{
  const found=requestedCode(initialMessage);
  return {...emptyDiscount,...found};
 });
 const [review,setReview]=useState<string|null>(null);
 const [toggleReview,setToggleReview]=useState<{type:"notice"|"discount";id:string;active:boolean;version:string}|null>(null);
 const [loadCount,setLoadCount]=useState(0);
 const load=useCallback(async()=>{
  const query=selectedStore?"?storeId="+encodeURIComponent(selectedStore):"";
  const response=await fetch("/api/assistant/operations"+query,{cache:"no-store"});
  const json=await response.json();
  if(!response.ok||!json.ok)throw new Error(json.error??"Secure operations unavailable.");
  setData(json as Data);
  setSelectedStore(old=>old||json.storeId||"");
 },[selectedStore]);
 useEffect(()=>{
  if(mode==="security")return;
  let alive=true;
  const timer=window.setTimeout(()=>{
   void load().then(()=>{if(alive)setError("");})
    .catch(e=>{if(alive)setError(e instanceof Error?e.message:"Unable to load tools.");});
  },0);
  return ()=>{alive=false;window.clearTimeout(timer);};
 },[load,mode,loadCount]);
 const rows=useMemo(()=>data?.notices.filter(n=>isAdmin||n.store_id===selectedStore)??[],
  [data,isAdmin,selectedStore]);
 const codes=useMemo(()=>data?.discounts??[],[data]);
 const currentNotice=rows.find(r=>r.id===editingNotice);
 const currentDiscount=codes.find(r=>r.id===editingDiscount);
 async function save(body:Record<string,unknown>){
  if(busy)return;
  setBusy(true);setError("");setMessage("");
  try{
   const res=await fetch("/api/assistant/operations",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body),cache:"no-store",
   });
   const json=await res.json();
   if(!res.ok||!json.ok)throw new Error(json.error??json.message??"Change could not be saved.");
   setMessage(json.message??"Saved.");
   setReview(null);setEditingNotice(null);setEditingDiscount(null);
   setNotice({...emptyNotice});setDiscount({...emptyDiscount});
   setLoadCount(x=>x+1);setToggleReview(null);router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Change not saved.");}
  finally{setBusy(false);}
 }
 function submitNotice(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!data?.noticesReady)return;
  const start=toIso(notice.startsAt),end=toIso(notice.endsAt);
  if((notice.startsAt&&!start)||(notice.endsAt&&!end)||
   (start&&end&&Date.parse(end)<=Date.parse(start))){
   setError("Check start and expiration dates; expiration must be later.");return;
  }
  const payload={operation:"save_notice",storeId:isAdmin
   ?(currentNotice?currentNotice.store_id:noticeScope==="global"?null:noticeScope):selectedStore,
   id:editingNotice,headline:notice.headline.trim(),detail:notice.detail,
   href:notice.href||null,startsAt:start,endsAt:end,active:notice.active,
   priority:notice.priority,expectedUpdatedAt:currentNotice?.updated_at??null};
  const snapshot=JSON.stringify(payload);
  if(review!==snapshot){setReview(snapshot);setError("");return;}
  void save(payload);
 }
 function submitDiscount(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!data?.discountsWritable)return;
  const payload={operation:"save_discount",storeId:selectedStore,id:editingDiscount,
   code:discount.code.toUpperCase(),kind:discount.kind,value:discount.value,
   minimum:discount.minimum,usageLimit:discount.usageLimit,
   startsAt:discount.startsAt?toIso(discount.startsAt):"",
   endsAt:discount.endsAt?toIso(discount.endsAt):"",
   active:currentDiscount?.is_active??discount.active,
   expectedUpdatedAt:currentDiscount?.updated_at??null};
  const snapshot=JSON.stringify(payload);
  if(review!==snapshot){setReview(snapshot);setError("");return;}
  void save(payload);
 }
 if(mode==="security")return <div className="apex-chat-ops">
   <p>For security, passwords and verification codes never go through chat. Open the protected account form to change your password or request a security code.</p>
   <Link href="/account/profile">Open secure password settings</Link>
  </div>;
 if(mode==="payouts")return <div className="apex-chat-ops">
  <p>Read-only payout readiness and verified sale records. Sales are not evidence that a payout occurred; chat cannot transfer money or edit wallet credentials.</p>
  {error&&<p role="alert">{error}</p>}
  {data?.stores.length&&data.stores.length>1&&<label>Store
   <select value={selectedStore} onChange={e=>setSelectedStore(e.target.value)}>
    {data.stores.map(st=><option key={st.id} value={st.id}>{st.name}</option>)}
   </select></label>}
  {data?.payouts&&<>
   {isAdmin&&<p>Supplier split draft: {data.payouts.splitReady?
    data.payouts.splitDraft?data.payouts.splitDraft.supplier_percent+"% supplier share":
    "No saved proposal":"Unavailable"}. This does not activate BTCPay/Prism allocations.</p>}
   <strong>Recent verified sale records</strong>
   {!data.payouts.salesReady?<p>Sales records unavailable.</p>:
    data.payouts.sales.length===0?<p>No recorded sales.</p>:
    <ul>{data.payouts.sales.map((sale,i)=><li key={i}>
     {sale.order_reference} · {sale.sale_state} · {sale.currency} {(Number(sale.gross_cents)/100).toFixed(2)}
    </li>)}</ul>}
   <strong>Wallet change requests</strong>
   {!data.payouts.walletReady?<p>Wallet request statuses unavailable.</p>:
    data.payouts.walletRequests.length===0?<p>No recent wallet change requests.</p>:
    <ul>{data.payouts.walletRequests.map((item,i)=><li key={i}>
     {item.label}: {item.request_state}
    </li>)}</ul>}
  </>}
  <div className="apex-chat-ops-actions">
   <Link href="/supplier/reports">Supplier verified sales reports</Link>
   {isAdmin&&<Link href="/admin/splits/configure">Admin payout split proposals</Link>}
   {isAdmin&&<Link href="/admin/payment-monitor">Payment monitor</Link>}
  </div>
 </div>;
 return <div className="apex-chat-ops">
  <p>Changes need a review and a second confirmation. Dates are interpreted in the local time shown by your device.</p>
  {error&&<p role="alert">{error}</p>}
  {message&&<p role="status">{message}</p>}
  {data?.stores.length&&data.stores.length>1&&<label>Store
   <select value={selectedStore} onChange={e=>{
    setSelectedStore(e.target.value);setEditingDiscount(null);setEditingNotice(null);setReview(null);
   }}>{data.stores.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select>
  </label>}
  {mode==="banners"?<>
   {!data?.noticesReady?<p>Banner management is waiting for its database migration.</p>:<>
    <strong>Scheduled announcements</strong>
    <div className="apex-chat-ops-items">{rows.length===0?<p>No notices yet.</p>:rows.map(n=>
     <div key={n.id} className="apex-chat-ops-item">
      <span><strong>{n.headline}</strong> · {n.is_active?"Enabled":"Paused"}</span>
      <small>{formatDate(n.starts_at)} – {formatDate(n.ends_at)}</small>
      <button type="button" onClick={()=>{
       setEditingNotice(n.id);setNotice(noticeFrom(n));setReview(null);
      }} disabled={busy}>Edit</button>
      <button type="button" disabled={busy} onClick={()=>{
       const next={type:"notice" as const,id:n.id,active:!n.is_active,version:n.updated_at};
       if(toggleReview?.type==="notice"&&toggleReview.id===n.id&&
         toggleReview.active===next.active&&toggleReview.version===next.version){
        setToggleReview(null);void save({operation:"toggle_notice",storeId:n.store_id,
         id:n.id,expectedUpdatedAt:n.updated_at,active:!n.is_active});
       }else setToggleReview(next);
      }}>{toggleReview?.type==="notice"&&toggleReview.id===n.id?
       "Confirm "+(n.is_active?"pause":"resume"):n.is_active?"Pause":"Resume"}</button>
     </div>)}</div>
    <form className="apex-chat-ops-form" onSubmit={submitNotice}>
     <strong>{editingNotice?"Edit announcement":"New announcement"}</strong>
     {isAdmin&&!editingNotice&&<label>Audience
      <select value={noticeScope} onChange={e=>{setNoticeScope(e.target.value);setReview(null);}}>
       <option value="global">All storefront visitors</option>
       {data?.stores.map(store=><option value={store.id} key={store.id}>{store.name}</option>)}
      </select></label>}
     {editingNotice&&<button type="button" onClick={()=>{
       setEditingNotice(null);setNotice({...emptyNotice});setReview(null);
      }}>Add another</button>}
     <label>Headline <input maxLength={120} minLength={3} required
      value={notice.headline} onChange={e=>{setNotice({...notice,headline:e.target.value});setReview(null);}}/></label>
     <label>Small description <textarea maxLength={240} value={notice.detail}
      onChange={e=>{setNotice({...notice,detail:e.target.value});setReview(null);}}/></label>
     <label>Link <select value={notice.href} onChange={e=>{setNotice({...notice,href:e.target.value});setReview(null);}}>
       <option value="">No link</option><option value="/">Home</option><option value="/catalog">Browse catalog</option>
      </select></label>
     <label>Starts at (optional) <input type="datetime-local" value={notice.startsAt}
      onChange={e=>{setNotice({...notice,startsAt:e.target.value});setReview(null);}}/></label>
     <label>Expires at (optional) <input type="datetime-local" value={notice.endsAt}
      onChange={e=>{setNotice({...notice,endsAt:e.target.value});setReview(null);}}/></label>
     <label>Priority (0–10) <input type="number" min={0} max={10} required
      value={notice.priority} onChange={e=>{setNotice({...notice,priority:Number(e.target.value)});setReview(null);}}/></label>
     <label><input type="checkbox" checked={notice.active}
      onChange={e=>{setNotice({...notice,active:e.target.checked});setReview(null);}}/> Enabled (subject to dates)</label>
     {review&&<p role="status">Review: {notice.headline} · {notice.active?"Enabled":"Paused"} ·
       {notice.startsAt?" starts "+notice.startsAt:" immediate"} ·
       {notice.endsAt?" expires "+notice.endsAt:" no expiration"}</p>}
     <button type="submit" disabled={busy}>{busy?"Saving…":review?"Confirm announcement":"Review announcement"}</button>
    </form>
   </>}
  </>:<>
   {!data?.discountsReady?<p>Discount codes are not available in the connected database.</p>:<>
    <strong>Discount codes</strong>
    <div className="apex-chat-ops-items">{codes.length===0?<p>No codes yet.</p>:codes.map(c=>
     <div key={c.id} className="apex-chat-ops-item">
      <strong>{c.code}</strong><span>{c.discount_kind==="percentage"?c.discount_value+"%":
       c.discount_kind==="fixed"?"$"+(c.discount_value/100).toFixed(2):"Free shipping"} · {c.is_active?"Active":"Inactive"}</span>
      <button type="button" onClick={()=>{
       setEditingDiscount(c.id);setDiscount(discountFrom(c));setReview(null);
      }} disabled={busy}>Edit</button>
      <button type="button" disabled={busy||!data?.discountsWritable}
       onClick={()=>{
        const next={type:"discount" as const,id:c.id,active:!c.is_active,
         version:String(c.is_active)};
        if(toggleReview?.type==="discount"&&toggleReview.id===c.id&&
          toggleReview.active===next.active&&toggleReview.version===next.version){
         setToggleReview(null);void save({operation:"toggle_discount",
          storeId:selectedStore,id:c.id,expectedActive:c.is_active,active:!c.is_active});
        }else setToggleReview(next);
       }}>{toggleReview?.type==="discount"&&toggleReview.id===c.id?
        "Confirm "+(c.is_active?"deactivate":"activate"):c.is_active?"Deactivate":"Activate"}</button>
     </div>)}</div>
    <form className="apex-chat-ops-form" onSubmit={submitDiscount}>
     <strong>{editingDiscount?"Edit discount code":"Create discount code"}</strong>
     {editingDiscount&&<button type="button" onClick={()=>{
       setEditingDiscount(null);setDiscount({...emptyDiscount});setReview(null);
      }}>Create another</button>}
     <label>Code <input required minLength={3} maxLength={24} pattern="[A-Za-z0-9_-]{3,24}"
      value={discount.code} readOnly={Boolean(editingDiscount)}
      onChange={e=>{setDiscount({...discount,code:e.target.value.toUpperCase()});setReview(null);}}/></label>
     <label>Type <select value={discount.kind} onChange={e=>{setDiscount({...discount,kind:e.target.value});setReview(null);}}>
      <option value="percentage">Percent off</option><option value="fixed">Dollars off</option>
      <option value="free_shipping">Free shipping</option></select></label>
     {discount.kind!=="free_shipping"&&<label>Value <input required type="number"
      min="0.01" max={discount.kind==="percentage"?95:9999999.99}
      step={discount.kind==="percentage"?"1":"0.01"} value={discount.value}
      onChange={e=>{setDiscount({...discount,value:e.target.value});setReview(null);}}/></label>}
     <label>Minimum subtotal ($) <input required type="number" min={0} step=".01"
      value={discount.minimum} onChange={e=>{setDiscount({...discount,minimum:e.target.value});setReview(null);}}/></label>
     <label>Maximum uses (blank = unlimited) <input type="number" min={1} max={1000000} step={1}
      value={discount.usageLimit} onChange={e=>{setDiscount({...discount,usageLimit:e.target.value});setReview(null);}}/></label>
     <label>Start <input type="datetime-local" value={discount.startsAt}
      onChange={e=>{setDiscount({...discount,startsAt:e.target.value});setReview(null);}}/></label>
     <label>Expiration <input type="datetime-local" value={discount.endsAt}
      onChange={e=>{setDiscount({...discount,endsAt:e.target.value});setReview(null);}}/></label>
     {!editingDiscount&&<label><input type="checkbox" checked={discount.active}
      onChange={e=>{setDiscount({...discount,active:e.target.checked});setReview(null);}}/> Active on creation</label>}
     {review&&<p role="status">Review {discount.code}: {discount.kind} {discount.value};
      confirmation will save changes without enabling checkout.</p>}
     <button type="submit" disabled={busy||!data?.discountsWritable}>{busy?"Saving…":
      !data?.discountsWritable?"Discount editing disabled":review?"Confirm discount":"Review discount"}</button>
    </form>
   </>}
  </>}
 </div>;
}
