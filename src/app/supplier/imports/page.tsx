import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupplierWorkspace } from "@/lib/auth/supplier-workspace";
import { ImportReviewForm } from "./review-form";
import { PromoteReviewedVariantForm } from "./promote-form";

export const dynamic="force-dynamic";
export const metadata={title:"Supplier Import Review | Apex",robots:{index:false,follow:false}};

export default async function SupplierImportReviewPage() {
  const w=await getSupplierWorkspace();
  if(!w) redirect("/supplier/sign-in");
  const ids=w.stores.map(s=>s.id);
  const [candidates,mappings]=await Promise.all([
    w.client.from("supplier_import_candidates")
      .select("id,store_id,source_index,product_name,strength,wholesale_cost_cents,review_status")
      .in("store_id",ids).order("source_index",{ascending:true}).limit(100),
    w.client.from("supplier_candidate_drafts")
      .select("candidate_id,store_id,product_id").in("store_id",ids).limit(500),
  ]);
  const {data,error}=candidates;
  const linked=new Set(mappings.data?.map(item=>item.candidate_id)??[]);
  const enabled=process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true";
  return <main className="container supplier-shell">
    <Link href="/supplier" className="back">← Supplier dashboard</Link>
    <p className="eyebrow">APEX / PRIVATE CATALOG INTAKE</p><h1>Supplier import review.</h1>
    <p className="lead">Unverified source-cost entries waiting for supplier validation. These are not retail listings or available inventory.</p>
    <p className="notice">Costs are internal wholesale estimates. Confirm product details, sale eligibility, retail prices, source documentation and real stock before creating any draft catalog entries.</p>
    <div className="actions"><Link href="/supplier/catalog" className="button secondary">Product editor</Link>
      <Link href="/supplier/inventory" className="button secondary">Inventory</Link></div>
    {error ? <section className="supplier-panel"><h2>Import records unavailable</h2><p>The private review queue has not been configured.</p></section>
      : mappings.error ? <section className="supplier-panel"><h2>Draft linkage unavailable</h2><p>Try again after the draft-link migration is verified.</p></section>
      : !data?.length ? <section className="supplier-panel"><h2>No source entries available.</h2><p>No supplier variants have been imported yet.</p></section>
      : <section className="supplier-panel" style={{maxWidth:"none",overflowX:"auto"}}>
        <h2>{data.length} imported variants</h2>
        <table style={{width:"100%",minWidth:760}}>
          <thead><tr><th scope="col">Source #</th><th scope="col">Product</th>
            <th scope="col">Strength</th><th scope="col">Unverified source cost</th>
            <th scope="col">Review</th><th scope="col">Draft product</th></tr></thead>
          <tbody>{data.map(item=><tr key={item.id} id={item.id}>
            <td>{item.source_index+1}</td><td><strong>{item.product_name}</strong></td>
            <td>{item.strength}</td>
            <td>{(Number(item.wholesale_cost_cents)/100).toLocaleString("en-US",{style:"currency",currency:"USD"})}</td>
            <td><ImportReviewForm storeId={item.store_id} candidateId={item.id}
               status={item.review_status} enabled={enabled}/></td>
            <td style={{minWidth:280}}>
              {linked.has(item.id) ? <p>Private draft already created</p>
              : item.review_status==="approved_for_draft"
              ? <PromoteReviewedVariantForm storeId={item.store_id} candidateId={item.id}
                   productName={item.product_name} strength={item.strength} enabled={enabled}/>
              : <p className="notice">Mark ready for draft first, then provide a verified retail price and stock.</p>}
            </td>
          </tr>)}</tbody>
        </table>
      </section>}
    <p className="notice">Only reviewed entries can create private drafts. Wholesale costs never become retail prices; source variants are not assumed to be in stock.</p>
  </main>;
}
