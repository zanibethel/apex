import Link from "next/link";
import Image from "next/image";
import {ProductImageUploader} from "./image-uploader";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { NewCategoryForm, NewProductForm, ProductRowEditor } from "../operations/forms";
import { ImportReviewForm } from "../imports/review-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared Catalog | Apex", robots: { index: false, follow: false } };

function money(value: number, currency: string) {
  if (!Number.isSafeInteger(value) || value < 0) return "Unavailable";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency,
    }).format(value / 100);
  } catch {
    return "Unavailable";
  }
}

export default async function SharedCatalog() {
  const client = await createSupplierServerClient();
  if (!client) return <main className="container supplier-shell"><h1>Catalog unavailable.</h1></main>;

  const { data: session, error: authError } = await client.auth.getUser();
  if (authError || !session.user || session.user.is_anonymous || !session.user.email_confirmed_at) {
    redirect("/supplier/sign-in");
  }

  const { data: memberships, error: membershipError } = await client
    .from("supplier_memberships").select("supplier_id,role").limit(20);

  if (membershipError || !memberships?.length) {
    return <main className="container supplier-shell">
      <h1>Supplier access required.</h1>
      <p>You do not have an assigned catalog workspace.</p>
      <Link className="button secondary" href="/supplier">Back to supplier dashboard</Link>
    </main>;
  }

  const { data: stores, error: storeError } = await client
    .from("stores").select("id,display_name,supplier_id,is_public")
    .in("supplier_id", memberships.map(member => member.supplier_id)).limit(20);

  if (storeError || !stores?.length) return <main className="container supplier-shell">
    <h1>Catalog unavailable.</h1>
    <Link href="/supplier">Back to supplier dashboard</Link>
  </main>;

  const ids = stores.map(store => store.id);
  const canWrite = process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED === "true" && stores.length === 1 && !stores[0].is_public;
  // RLS plus explicit store_id filters: no broad product/inventory reads.
  const [products, categories, inventory, candidates] = await Promise.all([
    client.from("products")
      .select("id,store_id,category_id,sku,name,description,price_cents,compare_at_price_cents,is_active,image_path,currency,is_published")
      .in("store_id", ids).order("name", { ascending: true }).limit(100),
    client.from("categories").select("id,store_id,name")
      .in("store_id", ids).limit(100),
    client.from("inventory_items")
      .select("product_id,store_id,quantity_on_hand,quantity_reserved")
      .in("store_id", ids).limit(100),
    client.from("supplier_import_candidates")
      .select("id,store_id,product_name,strength,wholesale_cost_cents,review_status", { count: "exact" })
      .in("store_id", ids).order("source_index", {ascending: true}).limit(12),
  ]);

  if (products.error || categories.error || inventory.error) {
    return <main className="container supplier-shell">
      <h1>Catalog temporarily unavailable.</h1>
      <p>Product and stock details could not be loaded safely.</p>
      <Link className="button secondary" href="/supplier">Back to supplier dashboard</Link>
    </main>;
  }

  const images=new Map<string,string>();
  await Promise.all((products.data??[]).filter(p=>p.image_path).map(async product=>{
    const {data:image,error}=await client.storage.from("apex-draft-product-images")
      .createSignedUrl(product.image_path!,120);
    if(!error&&image?.signedUrl)images.set(product.id,image.signedUrl);
  }));
  const categoryNames = new Map(categories.data?.map(c => [c.id, c.name]) ?? []);
  const choices = (categories.data ?? []).map(c => ({id:c.id,name:c.name}));
  const stock = new Map(inventory.data?.map(item => [item.product_id, item]) ?? []);
  const storeNames = new Map(stores.map(s => [s.id, s.display_name]));

  return <main className="container supplier-shell">
    <Link href="/supplier" className="back">← Supplier dashboard</Link>
    <p className="eyebrow">APEX / PRIVATE SUPPLIER CATALOG</p>
    <h1>Shared catalog.</h1>
    <p className="lead">The same catalog is visible to every authorized member of your supplier team.</p>
    <p className="notice">Read-only preview by default. Draft editing unlocks only after reviewed database permissions and an explicit staging flag. Products are not published or sold through these controls.</p>
    <div className="actions"><Link className="button secondary" href="/supplier/inventory">Manage inventory</Link><Link className="button secondary" href="/supplier/reports">Sales history</Link></div>
    <section className="supplier-panel" style={{maxWidth:"none", marginBottom:24,overflowX:"auto"}}>
      <h2>Imported source variants ({candidates.error ? "unavailable" : candidates.count ?? 0})</h2>
      <p className="notice">These are supplier-provided, unverified product variants—not published catalog items, confirmed inventory, or retail prices.</p>
      {candidates.error ? <p>Source review information is unavailable.</p>
      : !candidates.data?.length ? <p>No imported variants to review.</p>
      : <table style={{width:"100%",minWidth:680}}>
          <thead><tr>
            <th scope="col">Product variant</th>
            <th scope="col">Unverified wholesale cost</th>
            <th scope="col">Supplier review</th>
          </tr></thead>
          <tbody>{candidates.data.map(item=><tr key={item.id}>
            <td><strong>{item.product_name}</strong><p>{item.strength}</p></td>
            <td>{money(Number(item.wholesale_cost_cents),"USD")}</td>
            <td><ImportReviewForm storeId={item.store_id} candidateId={item.id}
                status={item.review_status} enabled={canWrite}/></td>
          </tr>)}</tbody>
        </table>}
      <p className="notice">Showing up to 12 variants here. Use the full review screen to manage all imported variants.</p>
      <Link className="button secondary" href="/supplier/imports">Review all source variants</Link>
    </section>
    {stores.length === 1 && <div className="feature-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",marginBottom:24}}>
      <NewProductForm storeId={stores[0].id} enabled={canWrite} categories={choices}/>
      <NewCategoryForm storeId={stores[0].id} enabled={canWrite}/>
    </div>}
    {!products.data?.length ? <section className="supplier-panel">
      <h2>No products yet.</h2>
      <p>Approved catalog data has not been imported for this storefront.</p>
    </section> : <div className="supplier-panel" style={{ maxWidth: "none", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}>
        <caption style={{ textAlign: "left", marginBottom: 14 }}>First 100 products in your shared storefront</caption>
        <thead><tr>
          <th scope="col" style={{ textAlign: "left" }}>Product image / title</th>
          <th scope="col" style={{ textAlign: "left" }}>Category</th>
          <th scope="col" style={{ textAlign: "left" }}>Price</th>
          <th scope="col" style={{ textAlign: "left" }}>Inventory</th>
          <th scope="col" style={{ textAlign: "left" }}>Status / availability</th>
          <th scope="col" style={{ textAlign: "left" }}>Draft editing</th>
        </tr></thead>
        <tbody>{products.data.map(product => {
          const inv = stock.get(product.id);
          const price = typeof product.price_cents === "number"
            ? product.price_cents : Number(product.price_cents);
          return <tr key={product.id} style={{ borderTop: "1px solid var(--line)" }}>
            <td style={{ padding: "16px 12px 16px 0" }}>
              {images.get(product.id) && <Image src={images.get(product.id)!} alt={product.name}
                width={108} height={108} unoptimized style={{objectFit:"cover",borderRadius:8}}/>}
              <strong>{product.name}</strong>
              <div className="notice">{product.sku} · {storeNames.get(product.store_id)}</div>
              <p className="notice">{product.description}</p>
              {!product.is_published && <ProductImageUploader
                storeId={product.store_id} productId={product.id} enabled={canWrite}/>}
            </td>
            <td>{categoryNames.get(product.category_id ?? "") ?? "Uncategorized"}</td>
            <td>
              <strong>{money(price,product.currency)}</strong>
              {product.compare_at_price_cents!=null&&Number(product.compare_at_price_cents)>price&&
                <p><s>{money(Number(product.compare_at_price_cents),product.currency)}</s>
                  {" "}({Math.round(100*(Number(product.compare_at_price_cents)-price)/Number(product.compare_at_price_cents))}% off)
                </p>}
            </td>
            <td>{inv ? `${inv.quantity_on_hand} on hand · ${inv.quantity_reserved} reserved` : "Not tracked"}</td>
            <td>{product.is_published ? "Published record" : "Private draft"} · {product.is_active ? "Active" : "Inactive"}</td>
            <td>{!product.is_published ? <ProductRowEditor storeId={product.store_id} productId={product.id} name={product.name} description={product.description??""} price={(price/100).toFixed(2)}
                comparePrice={product.compare_at_price_cents==null?"":(Number(product.compare_at_price_cents)/100).toFixed(2)}
                isActive={product.is_active} categoryId={product.category_id} categories={choices} enabled={canWrite}/> : "Locked"}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
    <p className="notice">No public publishing, checkout, payments, or order creation is enabled. Editing is gated by audited database write permissions.</p>
  </main>;
}
