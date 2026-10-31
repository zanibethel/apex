import type { Metadata } from "next";
import Link from "next/link";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";
import { signOutAccount } from "@/app/account/sign-out/actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apex | Concept Preview",
  description: "Non-transactional preview of a founding-supplier storefront.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const client = await createSupplierServerClient();
  const { data } = client ? await client.auth.getUser() : { data: { user: null } };
  const user = data.user && !data.user.is_anonymous && data.user.email_confirmed_at ? data.user : null;
  const admin = isVerifiedPlatformAdmin(user);
  const membership = user && !admin && client ? await client.from("supplier_memberships").select("supplier_id").limit(1) : null;
  const supplier = Boolean(membership && !membership.error && membership.data?.length);
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand apex-logo-link" aria-label="Apex Anabolics home"><img src="https://7c583f0b-88c8-40f5-be6f-ec33c5f1c432.sandbox.floot.app/_cdn/static/bf91e04a-93f1-4a12-adf3-b15216a69b96-apex_logo_cleaned.png" alt="Apex Anabolics" width="210" height="50" /></Link>
            <nav aria-label="Main navigation" className="apex-navigation">
              <details className="apex-menu">
                <summary aria-label="Open navigation menu">☰ <span>Menu</span></summary>
                <div className="apex-menu-panel">
                  <Link href="/catalog">Catalog</Link>
                  <Link href="/#approach">Approach</Link>
                  <Link href="/account/profile">My profile</Link>
                  {admin && <Link href="/admin">Admin dashboard</Link>}
                  {supplier && <Link href="/supplier">Supplier workspace</Link>}
                  {user ? <form action={signOutAccount}><button type="submit" className="apex-menu-signout">Sign out</button></form> : <Link href="/account/sign-in">Account sign in</Link>}
                </div>
              </details>
            </nav>
            <span className="demo-chip">DEMO ONLY</span>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="container footer-inner">
            <span>APEX / WORKING CONCEPT</span>
            <span>No products, orders or payments are available.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
