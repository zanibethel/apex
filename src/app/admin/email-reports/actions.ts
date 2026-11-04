"use server";
import {createHash} from "node:crypto";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";

export async function activateSupplierReportEmailSender(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");
 const token=process.env.APEX_REPORT_DISPATCH_TOKEN;
 const resend=process.env.RESEND_REPORTS_API_KEY;
 const cron=process.env.CRON_SECRET;
 if(!token||!/^[0-9a-f]{64}$/.test(token)||
  !resend||!resend.startsWith("re_")||
  !cron||cron.length<24)
  redirect("/admin/email-reports?result=unconfigured");
 const digest=createHash("sha256").update(token,"utf8").digest("hex");
 const {data,error:rpcError}=await client.rpc(
  "admin_activate_daily_report_mail_sender",{p_token_sha256:digest});
 if(rpcError||data?.sender_activated!==true)
  redirect("/admin/email-reports?result=failed");
 redirect("/admin/email-reports?result=activated");
}
