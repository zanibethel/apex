"use server";

import { revalidatePath } from "next/cache";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";
import { areApexInvitationsEnabled, createApexAuthAdminClient } from "@/lib/auth/admin-service";

export type InviteResult = { ok: boolean; message: string };

export async function inviteAccount(_previous: InviteResult, formData: FormData): Promise<InviteResult> {
  // Check the active account on the Auth server for each mutation.
  const session = await createSupplierServerClient();
  if (!session) return { ok: false, message: "Access denied." };
  const { data, error } = await session.auth.getUser();
  if (error || !isVerifiedPlatformAdmin(data.user)) return { ok: false, message: "Access denied." };

  if (!areApexInvitationsEnabled()) {
    return { ok: false, message: "Invitations are disabled until private Auth Admin credentials and custom SMTP are configured." };
  }
  const email = formData.get("email");
  if (typeof email !== "string" || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { ok: false, message: "Enter a valid email address." };
  }

  const admin = createApexAuthAdminClient();
  if (!admin) return { ok: false, message: "The administrator integration is unavailable." };
  // Invite only. No automatic admin/supplier role elevation.
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email.trim().toLowerCase());
  if (inviteError) return { ok: false, message: "Invitation could not be sent. Check Auth SMTP and limits." };

  revalidatePath("/admin/users");
  return { ok: true, message: "Invitation requested. Verify delivery in the recipient's inbox." };
}
