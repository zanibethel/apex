import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { signOutSupplier } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared Supplier Workspace | Apex", robots: { index: false, follow: false } };

export default async function SupplierWorkspace() {
  const client = await createSupplierServerClient();
  if (!client) return <main className="container supplier-shell">
    <h1>Workspace unavailable.</h1>
    <p>Supplier access is not configured for this environment.</p>
  </main>;

  // Verify the current Supabase Auth identity on every protected render.
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || auth.user.is_anonymous) redirect("/supplier/sign-in");

  const { data: memberships, error: membershipError } = await client
    .from("supplier_memberships").select("supplier_id,role").limit(20);

  if (membershipError || !memberships?.length) return <main className="container supplier-shell">
    <section className="supplier-panel">
      <h1>Supplier access required.</h1>
      <p>This account is not yet a member of a supplier workspace.</p>
      <form action={signOutSupplier}><button className="button secondary" type="submit">Sign out</button></form>
    </section>
  </main>;

  // Memberships and storefront data are both restricted by Supabase RLS.
  // Two people assigned to the SAME supplier_id see the SAME storefront.
  const supplierIds = memberships.map(entry => entry.supplier_id);
  const roleFor = new Map(memberships.map(entry => [entry.supplier_id, entry.role]));
  const { data: stores, error: storeError } = await client
    .from("stores")
    .select("id,supplier_id,display_name,slug,is_public")
    .in("supplier_id", supplierIds)
    .limit(20);
  const storeIds = stores?.map(store => store.id) ?? [];

  const summary = storeIds.length ? await Promise.all([
    client.from("products").select("id", { count: "exact", head: true }).in("store_id", storeIds),
    client.from("categories").select("id", { count: "exact", head: true }).in("store_id", storeIds),
    client.from("inventory_items").select("product_id", { count: "exact", head: true }).in("store_id", storeIds),
    client.from("supplier_import_candidates").select("id", { count: "exact", head: true }).in("store_id", storeIds),
    client.from("supplier_sales_history").select("id", { count: "exact", head: true }).in("store_id", storeIds),
    client.from("supplier_wallet_requests").select("id", { count: "exact", head: true }).in("store_id", storeIds),
  ]) : null;

  const metrics = [
    { label: "Imported variants to review", value: !summary || summary[3].error ? "—" : String(summary[3].count ?? 0), href: "/supplier/imports" },
    { label: "Draft / internal product records", value: !summary || summary[0].error ? "—" : String(summary[0].count ?? 0), href: "/supplier/catalog" },
    { label: "Inventory records", value: !summary || summary[2].error ? "—" : String(summary[2].count ?? 0), href: "/supplier/inventory" },
    { label: "Categories", value: !summary || summary[1].error ? "—" : String(summary[1].count ?? 0), href: "/supplier/catalog" },
    { label: "Sales history entries", value: !summary || summary[4].error ? "—" : String(summary[4].count ?? 0), href: "/supplier/reports" },
    { label: "Test wallet requests", value: !summary || summary[5].error ? "—" : String(summary[5].count ?? 0), href: "/supplier/wallets" },
  ];

  return <main className="container supplier-shell">
    <div className="supplier-heading">
      <div>
        <p className="eyebrow">APEX / SUPPLIER DASHBOARD</p>
        <h1>Storefront workspace.</h1>
        <p className="lead">Welcome, {auth.user.email}. Access is shared by the supplier team and limited to its assigned storefront.</p>
      </div>
      <form action={signOutSupplier}><button className="button secondary" type="submit">Sign out</button></form>
    </div>

    <section className="supplier-panel" aria-label="Your shared storefront">
      <h2>Shared storefront</h2>
      {storeError ? <p>Storefront information is temporarily unavailable.</p> :
        stores?.length ? <ul className="supplier-stores">
          {stores.map(store => <li key={store.id}>
            <div>
              <strong>{store.display_name}</strong>
              <p className="notice">Your role: {roleFor.get(store.supplier_id) ?? "Member"}</p>
            </div>
            <span>{store.is_public ? "Public" : "Private draft"}</span>
          </li>)}
        </ul> : <p>No storefronts have been assigned yet.</p>}
      <p className="notice">Every authorized member of this supplier workspace shares the same underlying store and catalog. No separate storefront is created per user.</p>
    </section>

    {storeIds.length > 0 && <section aria-label="Read-only storefront metrics" style={{ marginTop: 24 }}>
      <div className="feature-grid">
        {metrics.map(metric => <article className="feature-card" key={metric.label}>
          <p className="eyebrow">{metric.label}</p>
          <h2>{metric.value}</h2>
          <Link className="button secondary" href={metric.href}>Manage / review</Link>
        </article>)}
      </div>
    </section>}

    <section className="supplier-panel" style={{ marginTop: 24 }}>
      <h2>Store operations</h2>
      <p className="notice">Imported source variants are kept separate from drafted products and actual stock. No unverified source cost is treated as a retail price.</p>
      <p>Draft product editing, stock adjustments and wallet requests are gated. Live order handling and payments are not enabled in this technical preview.</p>
      <div className="actions"><Link href="/supplier/catalog" className="button primary">Products</Link><Link href="/supplier/imports" className="button secondary">Supplier import review</Link><Link href="/supplier/inventory" className="button secondary">Inventory</Link><Link href="/supplier/reports" className="button secondary">Sales history</Link><Link href="/supplier/wallets" className="button secondary">Bitcoin wallets</Link><Link href="/account/profile" className="button secondary">My profile and password</Link></div>
    </section>
  </main>;
}
