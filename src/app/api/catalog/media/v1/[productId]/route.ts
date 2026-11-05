import {NextResponse} from "next/server";

// Reserved future public-media delivery endpoint. No public asset registry,
// digest-verified asset copy, or independent media activation exists today.
// Until a separately reviewed data adapter is installed, ALL requests
// fail closed before storage lookup, redirects, signatures or cookies.
export const dynamic="force-dynamic";

export async function GET(){
 return NextResponse.json({state:"unavailable"},{
  status:404,
  headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"},
 });
}
