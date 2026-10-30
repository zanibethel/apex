import "server-only";
import { createSupplierServerClient } from "@/lib/supabase/server";

export async function getSupplierWorkspace() {
  const client = await createSupplierServerClient();
  if (!client) return null;
  const {data, error} = await client.auth.getUser();
  if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) return null;

  const memberships = await client.from("supplier_memberships")
    .select("supplier_id,role").limit(20);
  if (memberships.error || !memberships.data?.length) return null;

  const stores = await client.from("stores")
    .select("id,supplier_id,display_name,is_public")
    .in("supplier_id",memberships.data.map(m=>m.supplier_id)).limit(20);
  if (stores.error || !stores.data?.length) return null;
  return {client, user:data.user, stores: stores.data, memberships: memberships.data};
}
