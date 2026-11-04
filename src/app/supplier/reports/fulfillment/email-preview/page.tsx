import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {centralDateKey} from "@/lib/supplier/daily-order-report.mjs";
import {readCompleteReviewWorkbook}
 from "@/lib/supplier/read-complete-review-workbook";
import {createSupplierReviewEmailPreview,renderSupplierReviewEmailPreview}
 from "@/lib/supplier/review-email-report-manifest.mjs";
import {parseSupplierReviewEmailStatus}
 from "@/lib/supplier/review-email-delivery-status.mjs";
import ReviewEmailAttachmentDownload from "./download";

export const dynamic="force-dynamic";
export const metadata={
 title:"Review Email Preview | Apex Supplier",
 robots:{index:false,follow:false},
};
export default async function SupplierReviewEmailPreview(){
 const workspace=await getSupplierWorkspace();
 if(!workspace)redirect("/supplier/sign-in");
 const day=centralDateKey(new Date());
 if(!day)return <main className="container supplier-shell">
  <h1>Review email preview unavailable</h1>
 </main>;
 const results=await Promise.all(workspace.stores.map(async store=>{
  const workbook=await readCompleteReviewWorkbook(
   workspace.client,store.id,day,
  );
  if(!workbook)return {store,report:null};
  try{
   const report=createSupplierReviewEmailPreview(
    workbook,store.id,day,
   );
   const email=renderSupplierReviewEmailPreview(report.manifest);
   const {data,error}=await workspace.client.rpc(
    "get_supplier_review_email_status",{
     p_store:store.id,p_day:day,
    });
   const status=error?null:parseSupplierReviewEmailStatus(
    data,store.id,day,
   );
   return {store,report:{...report,email,status}};
  }catch{
   return {store,report:null};
  }
 }));
 return <main className="container supplier-shell">
  <Link className="back" href="/supplier/reports/fulfillment">
   ← Cumulative fulfillment review</Link>
  <p className="eyebrow">APEX / SUPPLIER / EMAIL REVIEW</p>
  <h1>Supplier report email preview</h1>
  <p className="lead">Preview the current held-order planning summary and
   a metadata-only CSV without sending an email. The original order
   source is review-only and does not establish payment, shipping
   eligibility or physical shipment.</p>
  <p className="notice">Report date: {day} · America/Chicago.
   This view uses your authenticated supplier membership. Customer
   delivery addresses, phone numbers, emails, order-line titles,
   tracking references and payment details are excluded from the
   attachment preview.</p>
  {results.map(({store,report})=><section key={store.id}
   className="supplier-panel" style={{maxWidth:"none",marginBottom:18}}>
   <h2>{store.display_name}</h2>
   {!report?<p role="alert">A complete, permission-checked
    review snapshot is unavailable. No email or attachment will be
    generated from incomplete records.</p>:<>
    <p className="notice">Original held orders: {report.manifest.orders}
     {" · "}New today: {report.manifest.newToday}
     {" · "}Carried forward: {report.manifest.carriedForward}
     {" · "}Partially planned: {report.manifest.partlyPlanned}
     {" · "}Fully planned (not shipped): {report.manifest.fullyPlannedReview}
     {" · "}Incomplete: {report.manifest.incomplete}</p>
    <p className="notice">Attachment: {report.manifest.attachmentName}
     {" · "}{report.manifest.rows} metadata rows
     {" · "}{report.manifest.attachmentBytes} bytes
     {" · "}SHA-256: <code>{report.manifest.digestSha256}</code></p>
    <ReviewEmailAttachmentDownload
     filename={report.manifest.attachmentName}
     csv={report.csv}/>
    <h3 style={{marginTop:18}}>Mobile-friendly email layout</h3>
    <p className="notice">Subject: {report.email.subject}</p>
    <iframe title={"Supplier email preview — "+store.display_name}
     sandbox="" srcDoc={report.email.html}
     style={{display:"block",width:"100%",maxWidth:600,height:710,
      border:"1px solid #41414a",borderRadius:12,background:"#111"}}/>
    <p className="notice">Delivery history:
     {" "}{report.status?
      report.status.state.replaceAll("_"," ")+
       " (simulated only; "+report.status.attempts+" attempts)":
      "Not available — no real delivery status can be inferred"}</p>
    <p className="notice">Actual provider accepted: No.
     Actual inbox delivered: No.
     This preview has not transmitted a message or purchased postage.</p>
   </>}
  </section>)}
  <div className="actions">
   <Link className="button secondary" href="/supplier/reports/fulfillment">
    Review original orders</Link>
   <Link className="button secondary" href="/supplier/reports/daily">
    Daily sales summary</Link>
  </div>
 </main>;
}
