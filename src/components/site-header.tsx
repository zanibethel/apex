import Link from "next/link";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";
import { readPublishedCategories } from "@/lib/supabase/public-catalog";
import { signOutAccount } from "@/app/account/actions";

export async function SiteHeader() {
  const client = await createSupplierServerClient();
  const auth = client ? await client.auth.getUser() : null;
  const user = !auth?.error && auth?.data.user && !auth.data.user.is_anonymous && auth.data.user.email_confirmed_at
    ? auth.data.user : null;
  const admin = isVerifiedPlatformAdmin(user);
  let supplier = false;
  if (user && client) {
    // Server-verified membership and database RLS, never an email allowlist.
    const members = await client.from("supplier_memberships").select("supplier_id").limit(1);
    supplier = !members.error && Boolean(members.data?.length);
  }
  const categories = await readPublishedCategories();
  return <header className="site-header">
    <div className="container header-inner apex-header">
      <Link href="/" className="brand" aria-label="Apex home"><span aria-hidden="true">▲</span> APEX</Link>
      <div className="apex-header-right">
        <span className="demo-chip">DEMO ONLY</span>
        <details className="apex-menu">
          <summary aria-label="Open site menu"><span aria-hidden="true">☰</span> Menu</summary>
          <nav aria-label="Site and account navigation" className="apex-menu-panel">
            <Link href="/">Home</Link>
            <Link href="/catalog">All products</Link>
            <div className="apex-menu-section">
              <strong>Product categories</strong>
              {categories.length ? categories.map(category =>
                <Link key={category.id} href={"/catalog?category=" + encodeURIComponent(category.id)}>{category.name}</Link>
              ) : <span className="notice">Categories coming soon</span>}
            </div>
            <Link href="/#approach">About Apex</Link>
            <div className="apex-menu-section">
              <strong>Account</strong>
              {user ? <>
                <Link href="/account/profile">My profile</Link>
                {supplier && <Link href="/supplier">Supplier workspace</Link>}
                {supplier && <Link href="/supplier/wallets">Supplier Bitcoin settings (test only)</Link>}
                {admin && <Link href="/admin">Admin dashboard</Link>}
                {admin && <Link href="/admin/splits">Payout allocation proposals</Link>}
                <form action={signOutAccount}><button className="apex-menu-logout" type="submit">Log out</button></form>
              </> : <Link href="/login">Log in</Link>}
            </div>
          </nav>
        </details>
      </div>
    </div>
  </header>;
}
