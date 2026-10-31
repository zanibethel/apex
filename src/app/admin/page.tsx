import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";

export const dynamic = "force-dynamic";

const dashboardLinks = [
  { title: "Users", description: "Review registered accounts and invitations.", href: "/admin/users", icon: "👥" },
  { title: "Allocations", description: "Review proposed payout splits and recipient setup.", href: "/admin/splits", icon: "◫" },
  { title: "Product reviews", description: "Review private supplier submissions and request changes.", href: "/admin/product-reviews", icon: "▤" },
  { title: "Supplier workspace", description: "Inspect supplier inventory and operations.", href: "/supplier", icon: "▣" },
];

export default async function AdminDashboard() {
  const client = await createSupplierServerClient();
  if (!client) redirect("/admin/sign-in");
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || !isVerifiedPlatformAdmin(data.user)) redirect("/admin/sign-in");

  return <main className="container supplier-shell apex-branded-dashboard" style={{ minWidth: 0 }}>
    <p className="eyebrow">APEX ANABOLICS / PLATFORM ADMIN</p>
    <h1 style={{ fontSize: "clamp(2rem, 7vw, 3.5rem)", lineHeight: 1.1, overflowWrap: "anywhere" }}>CONTROL ROOM</h1>
    <p className="notice">Authorized administration preview. Payment execution remains disabled.</p>
    <section aria-label="Admin tools" className="apex-admin-grid">
      {dashboardLinks.map(item => <Link key={item.href} href={item.href} className="apex-admin-card">
        <span className="apex-admin-icon" aria-hidden="true">{item.icon}</span>
        <span><strong>{item.title}</strong><small>{item.description}</small></span>
        <span className="apex-admin-arrow" aria-hidden="true">→</span>
      </Link>)}
    </section>
    <p className="notice">Need account details? <Link href="/account/profile">Open your profile</Link>.</p>
  </main>;
}
