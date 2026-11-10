import type { Metadata } from "next";
import Link from "next/link";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";
import { AccountMenu } from "./account-menu";
import { ApexAssistant } from "./apex-assistant";
import { StorefrontNoticeRotator } from "./storefront-notice-rotator";
import {CustomerCartProvider,CustomerCartLink} from "./cart/cart-provider";
import "./cart/customer-cart.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apex Anabolics | Product Catalog",
  description: "Explore the Apex Anabolics catalog and product availability.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const client = await createSupplierServerClient();
  const { data } = client ? await client.auth.getUser() : { data: { user: null } };
  const user = data.user && !data.user.is_anonymous && data.user.email_confirmed_at ? data.user : null;
  const admin = isVerifiedPlatformAdmin(user);
  const membership = user && !admin && client ? await client.from("supplier_memberships").select("supplier_id,role").limit(20) : null;
  const supplier = Boolean(membership && !membership.error && membership.data?.length);
  const notices = client ? await client.rpc("get_apex_public_notices") : null;
  const supplierCanManage = Boolean(membership && !membership.error && membership.data?.some(m => m.role === "owner" || m.role === "manager"));
  return (
    <html lang="en">
      <body>
        <CustomerCartProvider>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand apex-logo-link" aria-label="Apex Anabolics home"><img src="/apex-logo.png" alt="Apex Anabolics" width="210" height="50" /></Link>
            <nav aria-label="Main navigation" className="apex-navigation">
              <CustomerCartLink />
              <AccountMenu signedIn={Boolean(user)} admin={admin} supplier={supplier} />
            </nav>
            <span className="demo-chip">CHECKOUT UNAVAILABLE</span>
          </div>
        </header>
        <StorefrontNoticeRotator notices={notices&&!notices.error?notices.data:[]}/>
        {children}
        <footer className="site-footer">
          <div className="container footer-inner">
            <span>APEX ANABOLICS</span>
            <span>Catalog browsing only · Ordering and payments are unavailable.</span>
          </div>
        </footer>
        <ApexAssistant supplierCanManage={supplierCanManage} adminCanManage={admin}/>
        </CustomerCartProvider>
      </body>
    </html>
  );
}
