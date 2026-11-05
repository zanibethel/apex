import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {createCumulativeHeldCsv}
 from "@/lib/supplier/held-order-cumulative-csv.mjs";

export const dynamic="force-dynamic";
export const runtime="nodejs";

const responseHeaders={
 "Cache-Control":"private, no-store, max-age=0",
 "X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer",
 "Vary":"Cookie",
};

export async function GET(request:Request){
 const workspace=await getSupplierWorkspace();
 if(!workspace)return new Response("Authentication required",{
  status:401,headers:responseHeaders,
 });
 const url=new URL(request.url);
 const selected=url.searchParams.getAll("store");
 // No multi-store export or arbitrary filtering: each download is scoped
 // to exactly one membership-derived store in the authenticated workspace.
 if(selected.length!==1||url.searchParams.size!==1||
  !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(selected[0]))
  return new Response("Invalid report request",{
   status:400,headers:responseHeaders,
  });
 const store=workspace.stores.find(s=>s.id===selected[0]);
 if(!store)return new Response("Report not found",{
  status:404,headers:responseHeaders,
 });
 try{
  const report=await createCumulativeHeldCsv({
   rpc:workspace.client.rpc.bind(workspace.client),
   storeId:store.id,generatedAt:new Date(),
  });
  return new Response(report.csv,{
   status:200,
   headers:{
    ...responseHeaders,
    "Content-Type":"text/csv; charset=utf-8",
    "Content-Disposition":'attachment; filename="'+report.filename+'"',
    "X-Apex-Report-Generated-At":report.generatedAtUtc,
    "X-Apex-Report-Record-Count":String(report.recordCount),
   },
  });
 }catch{
  // Never return partial CSV, source errors, or another tenant's records.
  return new Response("Cumulative report unavailable; no partial file produced",{
   status:409,headers:responseHeaders,
  });
 }
}
