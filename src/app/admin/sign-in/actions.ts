"use server";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";

export type AdminState = { error: string };

export async function signInAdmin(_previous: AdminState, form: FormData): Promise<AdminState> {
  const email = form.get("email"), password = form.get("password");
  if (typeof email !== "string" || email.length > 254 || !email.includes("@") ||
      typeof password !== "string" || password.length < 1 || password.length > 4096) {
    return { error: "Unable to verify administrator credentials." };
  }
  const supabase = await createSupplierServerClient();
  if (!supabase) return { error: "Admin authentication is not configured here." };
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { error: "Unable to verify administrator credentials." };
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !isVerifiedPlatformAdmin(data.user)) {
    await supabase.auth.signOut();
    return { error: "This account is not yet authorized as an Apex administrator." };
  }
  redirect("/admin");
}
