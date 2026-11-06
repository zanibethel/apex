import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import CompactVariantCard from "@/components/catalog/compact-variant-card";
import type {CardVariant} from "@/components/catalog/compact-variant-card";

export const dynamic="force-dynamic";
export const metadata={title:"Supplier Product Options | Apex",robots:{index:false,follow:false}};

type SourceRow={
 id:string;store_id:string;source_row:number;parent_title:string;
 source_name:string;source_section:string;strength:string;size:string;
 carrier_oil:string;retail_price_cents:string|number|null;
 review_status:string;
};
type Parent={
 name:string;section:string;ready:CardVariant[];unresolved:number;
};
const MAX_ROWS=250;
const SOURCE_BATCH="lily-2026-11-05";
const VALID_LABEL=/^[A-Za-z0-9][A-Za-z0-9 .,_()+-]{0,39}$/;
const cents=(value:string|number|null)=>{
 const parsed=Number(value);
 return value!==null&&Number.isSafeInteger(parsed)&&parsed>=1&&parsed<=999999999
  ?parsed:null;
};

// Intentionally does not trust any browser price, supplier workbook URL,
// product ID match or checkout identity. It renders only RLS-scoped proposals.
function groupPrivateCandidates(rows:SourceRow[]):Parent[]|null{
 const groups=new Map<string,Parent>();
 const seenIds=new Set<string>();
 for(const r of rows){
  if(typeof r.id!=="string"||seenIds.has(r.id)||
   typeof r.parent_title!=="string"||!r.parent_title.trim()||
   typeof r.source_section!=="string"||
   !["","MCT","GSO"].includes(r.carrier_oil)||
   !["pending_review","needs_clarification"].includes(r.review_status)||
   typeof r.strength!=="string"||typeof r.size!=="string")return null;
  seenIds.add(r.id);
  const name=r.parent_title.trim();
  if(!groups.has(name))groups.set(name,{name,section:r.source_section,ready:[],unresolved:0});
  const group=groups.get(name)!;
  if(group.section!==r.source_section)return null;
  const retail=cents(r.retail_price_cents);
  if(r.review_status!=="pending_review"||retail===null){
   group.unresolved++;
   continue;
  }
  // Complex blend formulae are composition text, not selectable strength.
  // Keep them out of the strength selector; the parent name remains intact.
  const strength=VALID_LABEL.test(r.strength)?r.strength:"";
  const size=VALID_LABEL.test(r.size)?r.size:"";
  group.ready.push({
   id:r.id,carrierOil:r.carrier_oil,strength,size,retailPriceCents:retail,
  });
 }
 return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
}

export default async function SupplierVariantReview(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/supplier/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!auth.user||auth.user.is_anonymous||!auth.user.email_confirmed_at)
  redirect("/supplier/sign-in");
 const {data:memberships,error:membershipError}=await client.from("supplier_memberships")
  .select("supplier_id,role").in("role",["owner","manager"]).limit(20);
 if(membershipError||!memberships?.length)return <main className="container supplier-shell">
  <h1>Supplier owner or manager access required.</h1>
  <Link href="/supplier/catalog">Back to products</Link>
 </main>;
 const {data:stores,error:storeError}=await client.from("stores")
  .select("id,supplier_id,is_public")
  .in("supplier_id",memberships.map(m=>m.supplier_id))
  .eq("is_public",false).limit(20);
 if(storeError||!stores||stores.length!==1)return <main className="container supplier-shell">
  <h1>Choose a single private supplier storefront.</h1>
  <Link href="/supplier/catalog">Back to products</Link>
 </main>;
 const store=stores[0];
 const {data, count, error}=await client.from("apex_supplier_variant_review_items")
  .select("id,store_id,source_row,parent_title,source_name,source_section,strength,size,carrier_oil,retail_price_cents,review_status",{count:"exact"})
  .eq("store_id",store.id).eq("source_batch",SOURCE_BATCH)
  .order("parent_title").order("source_row").limit(MAX_ROWS);
 if(error||count===null||count>MAX_ROWS||count!==data?.length||
    data?.some(r=>r.store_id!==store.id))
  return <main className="container supplier-shell">
   <h1>Product options temporarily unavailable.</h1>
   <p>Nothing has been imported or published by this page.</p>
   <Link href="/supplier/catalog">Back to products</Link>
  </main>;
 const groups=groupPrivateCandidates(data as SourceRow[]);
 if(groups===null)return <main className="container supplier-shell">
  <h1>Product option review needs attention.</h1>
  <p>Invalid or inconsistent data was rejected. No records were changed.</p>
  <Link href="/supplier/catalog">Back to products</Link>
 </main>;
 const ready=groups.reduce((n,g)=>n+g.ready.length,0);
 const unresolved=groups.reduce((n,g)=>n+g.unresolved,0);
 return <main className="container supplier-shell apex-branded-dashboard">
  <Link className="back" href="/supplier/catalog">← Product manager</Link>
  <p className="eyebrow">APEX / SUPPLIER / PRIVATE CATALOG</p>
  <h1>Product cards</h1>
  <p className="lead">One card per product. Choose a size, strength or oil on the card to
   see that option&apos;s retail price. This is a private review only.</p>
  <p className="notice" role="status">
   {groups.length} products · {ready} priced options · {unresolved} options needing review.
   Existing products, images, stock and public listings are unchanged.
  </p>
  {groups.length===0?<section className="supplier-panel">
   <h2>Supplier options not staged yet</h2>
   <p>There are no private option records to preview. Nothing has been published.</p>
  </section>:
   <div className="apex-compact-product-grid">
    {groups.map(group=>group.ready.length?
     <div key={group.name}>
      <CompactVariantCard name={group.name} category={group.section}
       variants={group.ready}/>
      {group.unresolved>0&&<p className="notice">
       {group.unresolved} additional option(s) held for supplier clarification.
      </p>}
     </div>:
     <article className="apex-compact-product" key={group.name}>
      <div className="apex-compact-product-body">
       <p className="apex-compact-product-category">{group.section}</p>
       <h3>{group.name}</h3>
       <p className="notice">Price or option requires supplier clarification.</p>
       <p className="apex-compact-product-availability">Not available to order</p>
      </div>
     </article>)}
   </div>}
  <p className="notice">Retail prices are the supplier&apos;s proposals, not verified
   inventory or checkout prices. There is no publish, stock, payment or order
   action on this page.</p>
 </main>;
}
