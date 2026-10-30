import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupplierWorkspace } from "@/lib/auth/supplier-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales Reports | Apex", robots: { index: false, follow: false } };

export default async function ReportsPage() {
  const w = await getSupplierWorkspace();
  if (!w) redirect("/supplier/sign-in");
  const { data, error } = await w.client.from("supplier_sales_history")
    .select("id,store_id,order_reference,sale_state,gross_cents,currency,confirmed_btc_sats,occurred_at")
    .in("store_id",w.stores.map(s=>s.id)).order("occurred_at",{ascending:false}).limit(100);

  return <main className="container supplier-shell">
    <Link className="back" href="/supplier">← Supplier workspace</Link>
    <p className="eyebrow">APEX / VERIFIED HISTORY</p><h1>Sales reports.</h1>
    <p className="lead">The shared storefront history shows recorded sales and payment status—not estimated or simulated revenue.</p>
    {error ? <section className="supplier-panel"><h2>Reporting is not yet configured</h2>
      <p>No verified sales data source is connected in this environment.</p></section>
      : !data?.length ? <section className="supplier-panel"><h2>No sales recorded.</h2>
        <p>There are no verified transactions yet. We will not show invented revenue or payouts.</p>
      </section> : <section className="supplier-panel" style={{maxWidth:"none",overflowX:"auto"}}>
        <table style={{width:"100%",minWidth:650}}>
          <thead><tr><th scope="col">Date</th><th scope="col">Reference</th>
          <th scope="col">Status</th><th scope="col">Gross</th><th scope="col">BTC confirmed</th></tr></thead>
          <tbody>{data.map(s=><tr key={s.id}>
            <td>{new Date(s.occurred_at).toLocaleDateString("en-US")}</td>
            <td>{s.order_reference}</td><td>{s.sale_state}</td>
            <td>{(Number(s.gross_cents)/100).toLocaleString("en-US",{style:"currency",currency:"USD"})}</td>
            <td>{s.confirmed_btc_sats == null ? "Not confirmed" : String(s.confirmed_btc_sats)+" sats"}</td>
          </tr>)}</tbody>
        </table>
      </section>}
    <p className="notice">Payout reconciliations will appear only after server-verified payment and settlement integrations are available.</p>
  </main>;
}
