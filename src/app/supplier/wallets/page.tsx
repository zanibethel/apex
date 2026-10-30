import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupplierWorkspace } from "@/lib/auth/supplier-workspace";
import { WalletRequestForm } from "../operations/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bitcoin Settings | Apex", robots: { index: false, follow: false } };

export default async function WalletsPage() {
  const w=await getSupplierWorkspace();
  if (!w) redirect("/supplier/sign-in");
  const {data,error}=await w.client.from("supplier_wallet_requests")
    .select("id,store_id,label,address,network,request_state,created_at")
    .in("store_id",w.stores.map(s=>s.id)).order("created_at",{ascending:false}).limit(50);
  const enabled=process.env.APEX_WALLET_REQUESTS_ENABLED==="true";
  return <main className="container supplier-shell">
    <Link href="/supplier" className="back">← Supplier workspace</Link>
    <p className="eyebrow">APEX / BITCOIN SETTINGS</p><h1>Wallet destinations.</h1>
    <p className="lead">Proposed destinations for the shared storefront. New requests cannot activate payouts.</p>
    <p className="notice">No wallet keys are stored here. Never enter a recovery phrase, seed or private key.</p>
    {error ? <p>Wallet request data is not yet configured.</p>
      : !data?.length ? <section className="supplier-panel">
        <h2>No wallet destinations requested.</h2>
        <p>No test-network destinations are configured for review.</p>
      </section> : <section className="supplier-panel" style={{maxWidth:"none"}}>
        <h2>Destination requests</h2>
        <ul className="supplier-stores">{data.map(item=><li key={item.id}>
          <div><strong>{item.label}</strong><p className="notice">{item.address.slice(0,12)}…{item.address.slice(-6)} · {item.network}</p></div>
          <span>{item.request_state}</span>
        </li>)}</ul>
      </section>}
    {w.stores.length===1 && <div style={{marginTop:24}}>
      <WalletRequestForm storeId={w.stores[0].id} enabled={enabled&&!w.stores[0].is_public}/>
    </div>}
    <p className="notice">BTCPay Server/Prism signing, destination verification and reconciliation must pass separate reviews before actual transfers can be supported.</p>
  </main>;
}
