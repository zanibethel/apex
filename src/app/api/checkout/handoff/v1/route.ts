import {NextResponse} from "next/server";

// Reserved integration boundary for Track 2. It is intentionally non-admitting
// until Track 2 supplies independent, server-authoritative quote/stock checks,
// idempotent canonical order handling and an explicitly approved commerce gate.
// Never read or retain delivery PII while admission is not implemented.
export const dynamic="force-dynamic";
const HEADERS={
 "Cache-Control":"no-store, private",
 "X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer",
};
const unavailable=()=>NextResponse.json({
 schemaVersion:1,accepted:false,code:"CHECKOUT_UNAVAILABLE",
 canReserveStock:false,canCreateOrder:false,canCreatePayment:false,
},{status:503,headers:HEADERS});

export async function POST(){
 return unavailable();
}
export async function GET(){
 return NextResponse.json({accepted:false,code:"METHOD_NOT_ALLOWED"},
  {status:405,headers:{...HEADERS,Allow:"POST"}});
}
