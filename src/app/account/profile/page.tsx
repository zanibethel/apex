import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";
import type { AccountDetails } from "@/lib/account/profile-fields";
import { AccountDetailsForm } from "./details-form";
import { ProfileForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Profile | Apex", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const client = await createSupplierServerClient();
  if (!client) return <main className="container supplier-shell"><h1>Profile unavailable</h1></main>;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at)
    redirect("/login");

  const user = data.user;
  const admin = isVerifiedPlatformAdmin(user);
  const [members, profile] = await Promise.all([
    client.from("supplier_memberships").select("supplier_id,role").limit(20),
    client.from("account_profiles").select(
      "first_name,last_name,phone,address_line1,address_line2,city,region,postal_code,country_code"
    ).eq("user_id", user.id).maybeSingle(),
  ]);
  const supplier = !members.error && Boolean(members.data?.length);
  const details = profile.error ? null : profile.data as AccountDetails | null;

  return <main className="container supplier-shell">
    <Link href="/account" className="back">← Account home</Link>
    <p className="eyebrow">APEX / MY PROFILE</p>
    <h1>My profile</h1>
    <p className="lead">Your private account details and available tools.</p>
    <div className="apex-profile-stack">
      <AccountDetailsForm email={user.email ?? ""} details={details} available={!profile.error}/>
      {(admin || supplier) && <section className="supplier-panel" style={{maxWidth:"none"}}>
        <h2>Authorized account tools</h2>
        <p className="notice">These links appear only for your verified admin role or supplier membership. Your account email alone never grants access.</p>
        <div className="actions">
          {supplier && <Link href="/supplier" className="button secondary">Supplier workspace</Link>}
          {supplier && <Link href="/supplier/wallets" className="button secondary">Supplier Bitcoin destinations (test requests)</Link>}
          {admin && <Link href="/admin" className="button secondary">Admin dashboard</Link>}
          {admin && <Link href="/admin/splits" className="button secondary">Payout percentage proposals</Link>}
        </div>
        <p className="notice">Payout settings are currently storefront-level drafts or test-network destination requests—not personal live wallets, signing credentials, or enabled transfers.</p>
      </section>}
      <ProfileForm />
    </div>
  </main>;
}
