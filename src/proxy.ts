import type { NextRequest } from "next/server";
import { updateSupplierSession } from "@/lib/supabase/supplier-proxy";
export async function proxy(request: NextRequest) { return updateSupplierSession(request); }
export const config = { matcher: ["/supplier/:path*"] };
