"use server";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";

export async function signOutAdmin() {
  const client = await createSupplierServerClient();
  if (client) await client.auth.signOut();
  redirect("/admin/sign-in");
}
