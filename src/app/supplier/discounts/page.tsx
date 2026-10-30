import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {PromotionEditor,PromotionStatus,PreviewPromotion} from "./forms";

export const dynamic="force-dynamic";
export const metadata={title:"Discount Codes | Apex",robots:{index:false,follow:false}};

export default async function SupplierDiscounts() {
  const w=await getSupplierWorkspace();
  if(!w)redirect("/supplier/sign-in");
  const ids=w.stores.map(s=>s.id);
  const {data,error}=await w.client.from("supplier_discount_codes")
    .select("id,store_id,code,discount_kind,discount_value,min_subtotal_cents,starts_at,ends_at,usage_limit,redemption_count,is_active")
    .in("store_id",ids).order("created_at",{ascending:false}).limit(100);
  const enabled=process.env.APEX_DRAFT_PROMOS_ENABLED==="true";
  return <main className="container supplier-shell">
    <Link className="back" href="/supplier">← Supplier dashboard</Link>
    <p className="eyebrow">APEX / SHARED STORE PROMOTIONS</p>
    <h1>Discount codes</h1>
    <p className="lead">Lily and Tierra can create and manage codes for the same storefront.</p>
    <p className="notice">Code management is a private preview. Live checkout is disabled; no code has redeemed an order or changed a Bitcoin settlement.</p>
    {w.stores.length===1&&<PromotionEditor storeId={w.stores[0].id} enabled={enabled&&!w.stores[0].is_public}/>}
    <section className="supplier-panel" style={{maxWidth:"none"}}>
      <h2>Existing codes</h2>
      {error?<p>Discount data is not configured.</p>:
      !data?.length?<p>No supplier discount codes yet.</p>:
      <div className="feature-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))"}}>
        {data.map(p=><article className="feature-card" key={p.id}>
          <h3>{p.code}</h3>
          <p>{p.discount_kind==="percentage"?`${p.discount_value}% off`: `${(p.discount_value/100).toFixed(2)} USD off`}</p>
          <p className="notice">{p.is_active?"Active in preview":"Inactive"} · Uses {p.redemption_count}{p.usage_limit?` / ${p.usage_limit}`:""}</p>
          <PromotionStatus storeId={p.store_id} promotion={p} enabled={enabled}/>
          <PromotionEditor storeId={p.store_id} existing={p} enabled={enabled}/>
        </article>)}
      </div>}
    </section>
    {w.stores.length===1&&<PreviewPromotion storeId={w.stores[0].id}/>}
  </main>;
}
