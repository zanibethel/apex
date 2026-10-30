import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupplierWorkspace } from "@/lib/auth/supplier-workspace";
import { ImportReviewForm } from "./review-form";

export const dynamic="force-dynamic";
export const metadata={title:"Supplier Import Review | Apex",robots:{index:false,follow:false}};

export default async function SupplierImportReviewPage() {
  const w=await getSupplierWorkspace();
  if(!w) redirect("/supplier/sign-in");
  const {data,error}=await w.client.from("supplier_import_candidates")
    .select("id,store_id,source_index,product_name,strength,wholesale_cost_cents,review_status")
    .in("store_id",w.stores.map(s=>s.id))
    .order("source_index",{ascending:true}).limit(100);
  const enabled=process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true";
  return <main className="container supplier-shell">
    <Link href="/supplier" className="back">← Supplier dashboard</Link>
    <p className="eyebrow">APEX / PRIVATE CATALOG INTAKE</p><h1>Supplier import review.</h1>
    <p className="lead">Unverified source-cost entries waiting for supplier validation. These are not retail listings or available inventory.</p>
    <p className="notice">Costs are internal wholesale estimates. Confirm product details, sale eligibility, retail prices, source documentation and real stock before creating any draft catalog entries.</p>
    <div className="actions"><Link href="/supplier/catalog" className="button secondary">Product editor</Link>
      <Link href="/supplier/inventory" className="button secondary">Inventory</Link></div>
    {error ? <section className="supplier-panel"><h2>Import records unavailable</h2><p>The private review queue has not been configured.</p></section>
      : !data?.length ? <section className="supplier-panel"><h2>No source entries available.</h2><p>No supplier variants have been imported yet.</p></section>
      : <section className="supplier-panel" style={{maxWidth:"none",overflowX:"auto"}}>
        <h2>{data.length} imported variants</h2>
        <table style={{width:"100%",minWidth:760}}>
          <thead><tr><th scope="col">Source #</th><th scope="col">Product</th>
            <th scope="col">Strength</th><th scope="col">Unverified source cost</th>
            <th scope="col">Review</th></tr></thead>
          <tbody>{data.map(item=><tr key={item.id}>
            <td>{item.source_index+1}</td><td><strong>{item.product_name}</strong></td>
            <td>{item.strength}</td>
            <td>{(Number(item.wholesale_cost_cents)/100).toLocaleString("en-US",{style:"currency",currency:"USD"})}</td>
            <td><ImportReviewForm storeId={item.store_id} candidateId={item.id}
               status={item.review_status} enabled={enabled}/></td>
          </tr>)}</tbody>
        </table>
      </section>}
    <p className="notice">Marking an entry ready for draft does not publish, price, stock or activate a product.</p>
  </main>;
}
