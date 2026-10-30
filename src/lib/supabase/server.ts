import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupplierAuthConfig } from "./session-config";

export async function createSupplierServerClient() {
  const config = getSupplierAuthConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Next Server Components cannot write cookies; Proxy refreshes them.
        }
      },
    },
  });
}
