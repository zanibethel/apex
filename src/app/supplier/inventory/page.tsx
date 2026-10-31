import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupplierWorkspace } from "@/lib/auth/supplier-workspace";
import { StockEditor } from "../operations/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventory | Apex", robots: { index: false, follow: false } };

export default async function InventoryPage() {
  const w = await getSupplierWorkspace();
  if (!w) redirect("/supplier/sign-in");
  const ids = w.stores.map(s => s.id);
  const [items, products, candidates] = await Promise.all([
    w.client.from("inventory_items").select("store_id,product_id,quantity_on_hand,quantity_reserved").in("store_id",ids).limit(100),
    w.client.from("products").select("id,store_id,sku,name,is_published").in("store_id",ids).limit(100),
    w.client.from("supplier_import_candidates").select("id", {count:"exact",head:true}).in("store_id",ids),
  ]);
  const names = new Map(products.data?.map(p => [p.id,p]) ?? []);
  const writesEnabled = process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED === "true";
  const managingSupplierIds = new Set(w.memberships
    .filter(member => member.role === "owner" || member.role === "manager")
    .map(member => member.supplier_id));
  const editableStoreIds = new Set(w.stores
    .filter(store => !store.is_public && managingSupplierIds.has(store.supplier_id))
    .map(store => store.id));

  return <main className="container supplier-shell">
    <Link className="back" href="/supplier">← Supplier workspace</Link>
    <p className="eyebrow">APEX / INVENTORY</p>
    <h1>Shared stock.</h1>
    <p className="lead">Members of the same supplier share inventory. Owners and managers can edit private draft stock when editing is enabled; changes are checked and audited.</p>
    {items.error || products.error ? <p>Inventory data is temporarily unavailable.</p>
      : !items.data?.length ? <section className="supplier-panel">
        <h2>No confirmed inventory yet.</h2>
        <p>{!candidates.error && candidates.count != null ? `${candidates.count} source variants are awaiting supplier review. Their actual stock quantities have not been provided.` : "Supplier source quantities have not yet been verified."}</p>
        <p>Create a draft product and enter confirmed quantities to begin stock management.</p>
        <Link className="button secondary" href="/supplier/imports">Review source variants</Link>
        <Link className="button secondary" href="/supplier/catalog">Products</Link>
      </section>
      : <section className="supplier-panel" style={{maxWidth:"none"}}>
        <h2>Inventory records</h2>
        <div className="feature-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))"}}>
          {items.data.map(item => {
            const product = names.get(item.product_id);
            const editable = writesEnabled && editableStoreIds.has(item.store_id)
              && product?.store_id === item.store_id && product.is_published === false;
            return <article className="feature-card" key={item.product_id}>
              <h3>{product?.name ?? "Product"}</h3>
              <p className="notice">SKU: {product?.sku ?? "Unavailable"}</p>
              <p>On hand: {item.quantity_on_hand}</p>
              <p>Reserved: {item.quantity_reserved}</p>
              <p>Available: {item.quantity_on_hand - item.quantity_reserved}</p>
              {editable
                ? <StockEditor storeId={item.store_id} productId={item.product_id}
                    quantity={item.quantity_on_hand} enabled={true}/>
                : <p className="notice">Read-only stock. Editing requires an authorized owner or manager, a private draft, and enabled draft writes.</p>}
            </article>;
          })}
        </div>
      </section>}
    <p className="notice">No stock is automatically sold, reserved or shipped from this preview.</p>
  </main>;
}
