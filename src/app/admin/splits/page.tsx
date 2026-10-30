import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";
import { SplitForm } from "./form";

export const dynamic="force-dynamic";
export const metadata={title:"Payout Split Proposals | Apex",robots:{index:false,follow:false}};

export default async function AdminSplitsPage() {
  const client=await createSupplierServerClient();
  if(!client) redirect("/admin/sign-in");
  const {data:identity,error:authError}=await client.auth.getUser();
  if(authError || !isVerifiedPlatformAdmin(identity.user)) redirect("/admin/sign-in");

  const {data:stores,error:storeError}=await client.from("stores")
    .select("id,display_name,is_public").limit(20);
  const [splits,history]=stores?.length ? await Promise.all([
    client.from("store_split_drafts").select("store_id,supplier_percent,updated_at")
      .in("store_id",stores.map(s=>s.id)).limit(20),
    client.from("store_split_draft_audit")
      .select("id,store_id,prior_percent,next_percent,changed_at")
      .in("store_id",stores.map(s=>s.id)).order("changed_at",{ascending:false}).limit(20),
  ]) : [null,null];
  const current=new Map(splits?.data?.map(c=>[c.store_id,c])??[]);
  const enabled=process.env.APEX_SPLIT_DRAFT_WRITES_ENABLED==="true";

  return <main className="container supplier-shell">
    <Link className="back" href="/admin">← Admin dashboard</Link>
    <p className="eyebrow">APEX / PLATFORM CONTROLS</p><h1>Payout allocations.</h1>\n    <p><Link className="button secondary" href="/admin/splits/configure">Preview configurable multi-recipient splits</Link></p>
    <p className="lead">Prepare proposed storefront revenue splits. Only platform administrators can change these drafts.</p>
    <p className="notice">Neither draft changes nor their audit history alter the BTCPay/Prism payout configuration. No live transfers are enabled.</p>
    {storeError ? <p>Storefronts could not be loaded.</p>
      : !stores?.length ? <p>No storefronts registered.</p>
      : stores.map(store=><section key={store.id} className="supplier-panel" style={{marginBottom:24,maxWidth:"none"}}>
          <h2>{store.display_name}</h2>
          <p className="notice">{store.is_public?"Public storefront":"Private draft storefront"}</p>
          <p>Supplier share: <strong>{current.get(store.id)?.supplier_percent ?? 90}%</strong></p>
          <p>Platform share: <strong>{100-(current.get(store.id)?.supplier_percent ?? 90)}%</strong></p>
          <p className="notice">{current.has(store.id) ? "Saved draft proposal" : "90/10 planning default (not saved)"}</p>
          {splits?.error ? <p>Split settings unavailable.</p> :
            <SplitForm storeId={store.id}
              supplierPercent={current.get(store.id)?.supplier_percent ?? 90} enabled={enabled}/>}
        </section>)}
    <section className="supplier-panel" style={{maxWidth:"none"}}>
      <h2>Draft-change history</h2>
      {history?.error ? <p>Audit data is not configured.</p>
        : !history?.data?.length ? <p>No split proposals have been changed.</p>
        : <ul className="supplier-stores">
          {history.data.map(change=><li key={change.id}>
            <span>{new Date(change.changed_at).toLocaleString("en-US")}</span>
            <span>{change.prior_percent ?? "—"}% → {change.next_percent}% supplier</span>
          </li>)}
        </ul>}
    </section>
  </main>;
}
