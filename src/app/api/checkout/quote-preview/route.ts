import {NextResponse} from "next/server";

export const dynamic="force-dynamic";

// Retired historical quote endpoint. No runtime flag can re-enable it.
const headers={"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"};

export async function POST(){
 return NextResponse.json({error:"not_available"},{status:404,headers});
}
