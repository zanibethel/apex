// Scheduled supplier email HTML companion. Aggregate verified figures only.
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const MONEY=/^(0|[1-9]\d{0,15})$/;
const N=v=>Number.isSafeInteger(v)&&v>=0;
const USD=v=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(Number(v)/100);
const esc=v=>String(v).replaceAll("&","&amp;").replaceAll("<","&lt;")
 .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const card=(label,value)=>
 '<td width="50%" valign="top" style="width:50%;vertical-align:top;background:#27272d;border:1px solid #383740;border-radius:10px;padding:15px 12px;">'+
 '<div style="font-size:12px;line-height:1.5;color:#c6c4cd;">'+esc(label)+'</div>'+
 '<div style="font-size:26px;line-height:1.2;font-weight:700;color:#ffffff;margin-top:9px;overflow-wrap:anywhere;">'+esc(value)+'</div></td>';
const detail=(label,value)=>
 '<tr><td style="padding:10px 0;border-bottom:1px solid #393943;color:#c5c2cb;font-size:14px;line-height:1.45;">'+esc(label)+'</td>'+
 '<td align="right" style="text-align:right;padding:10px 0;border-bottom:1px solid #393943;color:#f6f4f7;font-size:14px;font-weight:600;line-height:1.45;">'+esc(value)+'</td></tr>';
export function renderSupplierDailyOrderHtml(v){
 if(!v||typeof v!=="object"||!DAY.test(v.report_date)||
  !["recorded_order_count","confirmed_order_count","pending_order_count",
   "refunded_order_count","cancelled_order_count"].every(k=>N(v[k]))||
  !["pending_gross_cents","confirmed_gross_cents","refunded_gross_cents",
   "confirmed_btc_sats"].every(k=>typeof v[k]==="string"&&MONEY.test(v[k]))||
  v.confirmed_order_count+v.pending_order_count+v.refunded_order_count+
   v.cancelled_order_count!==v.recorded_order_count)
  throw Error("Invalid supplier daily report");
 const day=esc(v.report_date);
 const spacer='<td width="10" style="width:10px;min-width:10px;font-size:1px;">&nbsp;</td>';
 const metrics='<tr>'+card("Recorded orders",v.recorded_order_count)+spacer+
  card("Confirmed orders",v.confirmed_order_count)+'</tr>'+
  '<tr><td colspan="3" height="10" style="height:10px;font-size:1px;line-height:1px;">&nbsp;</td></tr>'+
  '<tr>'+card("Pending orders",v.pending_order_count)+spacer+
  card("Confirmed gross",USD(v.confirmed_gross_cents))+'</tr>';
 const empty=v.recorded_order_count===0?
  '<p style="color:#c6c2cd;font-size:13px;line-height:1.65;margin:19px 0 4px;">No verified orders were recorded for this reporting date.</p>':"";
 return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">'+
 '</head><body style="margin:0;padding:0;background:#0b0c10;color:#f3f3f4;font-family:Arial,Helvetica,sans-serif;">'+
 '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Daily supplier order counts and recorded sales for '+day+'.</div>'+
 '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:#0b0c10;padding:18px 10px;"><tr><td align="center">'+
 '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;background:#17181d;border:1px solid #393a43;border-radius:13px;overflow:hidden;">'+
 '<tr><td style="background:#121318;padding:25px 22px;border-bottom:3px solid #a82443;">'+
 '<div style="font-size:12px;font-weight:700;letter-spacing:3px;color:#f4f3f6;">APEX <span style="color:#eab2c0;">ANABOLICS</span></div>'+
 '<h1 style="font-size:25px;line-height:1.25;margin:14px 0 7px;color:#fff;">Daily Order Report</h1>'+
 '<div style="color:#c9c7cf;font-size:13px;line-height:1.5;">'+day+' · Central Time</div></td></tr>'+
 '<tr><td style="padding:23px 20px;">'+
 '<p style="margin:0 0 18px;color:#dcdbe1;font-size:14px;line-height:1.65;">Your supplier order summary for the reporting period is ready.</p>'+
 '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;table-layout:fixed;">'+metrics+'</table>'+
 '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin-top:18px;">'+
 detail("Refunded orders",v.refunded_order_count)+
 detail("Cancelled orders",v.cancelled_order_count)+
 detail("Pending gross",USD(v.pending_gross_cents))+
 detail("Refunded gross",USD(v.refunded_gross_cents))+
 detail("Confirmed Bitcoin",v.confirmed_btc_sats+" sats")+
 '</table>'+empty+
 '<p style="font-size:12px;line-height:1.65;color:#bfc0c8;margin:20px 0;">Figures reflect recorded orders, not projected sales or supplier payouts.</p>'+
 '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#a82443;border-radius:8px;">'+
 '<a href="https://apexanabolics.co/supplier/reports/daily" style="display:inline-block;color:#ffffff;text-decoration:none;padding:14px 18px;font-size:14px;font-weight:700;">View Supplier Dashboard</a>'+
 '</td></tr></table>'+
 '<p style="color:#989aa6;font-size:12px;line-height:1.6;margin:21px 0 0;">Manage daily email preferences in your supplier dashboard.</p>'+
 '</td></tr><tr><td style="background:#111216;border-top:1px solid #393a43;text-align:center;padding:17px 18px;color:#9697a1;font-size:11px;line-height:1.6;">'+
 'APEX ANABOLICS · Supplier reporting<br>Sent from reports@apexanabolics.co'+
 '</td></tr></table></td></tr></table></body></html>';
}
