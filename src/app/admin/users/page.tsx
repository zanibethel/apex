import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";
import { areApexInvitationsEnabled, createApexAuthAdminClient } from "@/lib/auth/admin-service";
import { InviteAccountForm } from "./invite-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apex User Directory", robots: { index: false, follow: false } };

export default async function AdminUserDirectory() {
  const session = await createSupplierServerClient();
  if (!session) redirect("/admin/sign-in");
  const { data, error } = await session.auth.getUser();
  if (error || !isVerifiedPlatformAdmin(data.user)) redirect("/admin/sign-in");

  const service = createApexAuthAdminClient();
  const listing = service ? await service.auth.admin.listUsers({ page: 1, perPage: 50 }) : null;
  const users = listing?.data?.users ?? [];

  return (
    <main className="container supplier-shell">
      <Link className="back" href="/admin">← Control room</Link>
      <p className="eyebrow">APEX / ACCOUNTS</p>
      <h1>User directory.</h1>
      <p className="lead">Invite-only accounts; role changes are not enabled in this preview.</p>
      <section className="supplier-panel">
        <h2>Invite an account</h2>
        <InviteAccountForm enabled={areApexInvitationsEnabled()} />
      </section>
      <section className="supplier-panel" style={{ marginTop: 24 }}>
        <h2>Registered users</h2>
        {!service ? (
          <p>Private Auth Admin access is not configured. No secret keys belong in the browser.</p>
        ) : listing?.error ? (
          <p>Unable to load the directory. Check the administrator integration.</p>
        ) : users.length === 0 ? (
          <p>No Apex login accounts have been created yet.</p>
        ) : (
          <ul className="supplier-stores">
            {users.map((user) => (
              <li key={user.id}>
                <strong>{user.email ?? "Email not set"}</strong>
                <span>{user.app_metadata?.apex_role === "platform_admin" ? "Platform admin" : "Unassigned"} · {user.email_confirmed_at ? "Verified" : "Pending"}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="notice">Showing up to 50 Auth users. User creation and permission assignment are separate operations.</p>
      </section>
    </main>
  );
}
