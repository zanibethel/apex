import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { signOutSupplier } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Supplier Workspace | Apex", robots: { index: false, follow: false } };
export default async function SupplierWorkspace() {
  const client = await createSupplierServerClient();
  if (!client) return <main className="container supplier-shell"><h1>Workspace unavailable.</h1><p>Supplier access is not configured for this environment.</p></main>;

  // This makes a verified Auth-server request for every protected page render.
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || auth.user.is_anonymous) redirect("/supplier/sign-in");

  const { data: memberships, error: membershipError } = await client
    .from("supplier_memberships").select("supplier_id, role").limit(20);

  // The signed-in user must have an RLS-visible supplier membership.
  if (membershipError || !memberships?.length) return (
    <main className="container supplier-shell"><section className="supplier-panel">
      <h1>Access restricted.</h1>
      <p>This account does not have a supplier workspace assignment.</p>
      <form action={signOutSupplier}><button className="button secondary" type="submit">Sign out</button></form>
    </section></main>
  );

  const supplierIds = memberships.map((entry) => entry.supplier_id);
  const { data: stores, error: storeError } = await client
    .from("stores").select("id, supplier_id, display_name, slug, is_public")
    .in("supplier_id", supplierIds).limit(20);
  return (
    <main className="container supplier-shell">
      <div className="supplier-heading"><div>
        <p className="eyebrow">SUPPLIER WORKSPACE / READ ONLY</p>
        <h1>Welcome back.</h1>
        <p className="lead">Supplier association is checked on the server and enforced by Supabase row-level security.</p>
      </div><form action={signOutSupplier}><button className="button secondary" type="submit">Sign out</button></form></div>
      <section className="supplier-panel"><h2>Your workspace</h2>
        {storeError ? <p>Store details are temporarily unavailable.</p> : stores?.length ? (
          <ul className="supplier-stores">{stores.map(store => (
            <li key={store.id}><strong>{store.display_name}</strong><span>{store.is_public ? "Public catalog" : "Private draft"}</span></li>
          ))}</ul>
        ) : <p>No stores have been assigned yet.</p>}
        <p className="notice">Preview only. Inventory changes, orders, checkout and payouts are disabled.</p>
      </section>
    </main>
  );
}
