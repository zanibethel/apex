import type { User } from "@supabase/supabase-js";

// Admin privileges must come from trusted Supabase Auth application metadata.
// A mailbox address or user-editable metadata never grants access.
export function isVerifiedPlatformAdmin(
  user: Pick<User, "app_metadata" | "email_confirmed_at" | "is_anonymous"> | null | undefined,
): boolean {
  return Boolean(user && !user.is_anonymous && user.email_confirmed_at &&
    user.app_metadata?.apex_role === "platform_admin");
}
