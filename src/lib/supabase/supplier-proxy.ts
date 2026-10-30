import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupplierAuthConfig } from "./session-config";

export async function updateSupplierSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupplierAuthConfig();
  if (!config) return response;

  const client = createServerClient(config.url, config.key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        if (headers) {
          for (const name of ["cache-control", "expires", "pragma"] as const) {
            const value = headers[name];
            if (value) response.headers.set(name, value);
          }
        }
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });
  // Refresh verified claims; never authorize from getSession() or a cookie string.
  await client.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
