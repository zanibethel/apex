"use server";
import { createSupplierServerClient } from "@/lib/supabase/server";
export type ProfileDetailsState = { ok: boolean; message: string };
const fields = ["first_name", "last_name", "phone", "address_line1", "address_line2", "city", "state", "postal_code"] as const;
export async function saveProfileDetails(_previous: ProfileDetailsState, form: FormData): Promise<ProfileDetailsState> {
  const client = await createSupplierServerClient();
  if (!client) return { ok: false, message: "Profile editing is unavailable." };
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at)
    return { ok: false, message: "Sign in to update your profile." };
  const details: Record<string,string> = {};
  for (const key of fields) {
    const value = form.get(key);
    if (typeof value !== "string" || value.length > 200) return { ok:false, message:"Check your profile fields and try again." };
    const clean = value.trim();
    if (/[<>\u0000-\u001f\u007f]/.test(clean)) return { ok:false, message:"Remove unsupported characters from profile fields." };
    details[key] = clean;
  }
  if (details.phone && !/^[+()\d .-]{7,25}$/.test(details.phone)) return { ok:false, message:"Enter a valid phone number or leave it blank." };
  if (details.postal_code && !/^[A-Za-z0-9 -]{3,15}$/.test(details.postal_code)) return { ok:false, message:"Enter a valid postal code or leave it blank." };
  const { error: updateError } = await client.auth.updateUser({ data: { apex_profile: details } });
  return updateError ? { ok:false, message:"Unable to save profile details." } : { ok:true, message:"Profile saved." };
}
