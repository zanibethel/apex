export const REPO_URL="https://github.com/zanibethel/apex";
const clean=(v,max=140)=>typeof v==="string"?v.replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max):"";
const esc=v=>String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const ISSUE_URL=/^https:\/\/github\.com\/zanibethel\/apex\/issues\/\d+$/;
const PR_URL=/^https:\/\/github\.com\/zanibethel\/apex\/pull\/\d+$/;
export function centralDay(date=new Date()){
 const d=date instanceof Date?date:new Date(date);
 if(!Number.isFinite(d.getTime()))throw Error("Invalid report time");
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",
 }).formatToParts(d);
 const val=k=>parts.find(p=>p.type===k)?.value;
 return [val("year"),val("month"),val("day")].join("-");
}
export function normalizeProgress({pulls,issues,now=new Date()}){
 if(!Array.isArray(pulls)||!Array.isArray(issues)||
   pulls.length>100||issues.length>100)throw Error("Invalid GitHub progress sources");
 const cutoff=now.getTime()-7*86400000;
 const completed=pulls.filter(p=>p&&typeof p==="object"&&
  typeof p.merged_at==="string"&&Date.parse(p.merged_at)>=cutoff&&
  PR_URL.test(p.html_url||"")&&Number.isInteger(p.number))
 .sort((a,b)=>Date.parse(b.merged_at)-Date.parse(a.merged_at))
 .slice(0,10).map(p=>Object.freeze({title:clean(p.title),url:p.html_url,number:p.number}));
 const pending=issues.filter(i=>i&&typeof i==="object"&&
  !i.pull_request&&i.state==="open"&&ISSUE_URL.test(i.html_url||"")&&
  Number.isInteger(i.number))
 .map(i=>({title:clean(i.title),url:i.html_url,number:i.number,
  priority:Number(/^Apex P([0-7])\b/.exec(i.title||"")?.[1]??9)}))
 .sort((a,b)=>a.priority-b.priority||a.number-b.number)
 .slice(0,10).map(i=>Object.freeze(i));
 return Object.freeze({completed,pending,scanLimited:pulls.length===100||issues.length===100});
}
// Owner-approved amounts confirmed November 3, 2026; not receipts.
// Domain purchase is independently confirmed, but settled billed amounts are unknown.
export const PROJECT_PROVISIONAL_COSTS=Object.freeze([
 Object.freeze({
  id:"domain_apexanabolics_co",
  vendor:"Vercel",
  item:"apexanabolics.co domain registration",
  category:"one_time",
  purchasedLocalDate:"2026-10-29",
  ownerApprovedUsd:29.99,
  approvalSource:"owner_confirmation_2026_11_03",
  actualPaidUsd:null,
  basis:"Owner-approved first-year registration amount; Vercel confirms purchase, but settled invoice not verified.",
 }),
 Object.freeze({
  id:"proton_essentials_three_users",
  vendor:"Proton Mail",
  item:"Mail Essentials, three-user monthly subscription",
  category:"recurring_monthly",
  ownerApprovedUsd:23.97,
  approvalSource:"owner_confirmation_2026_11_03",
  actualPaidUsd:null,
  basis:"Owner-approved monthly budget of $7.99 per user for three users; actual invoice, seat count and billed interval are not independently verified.",
 }),
]);
const approvedLines=PROJECT_PROVISIONAL_COSTS.map(x=>
 x.vendor+" — "+x.item+": $"+x.ownerApprovedUsd.toFixed(2)+
 (x.category==="one_time"?" owner-approved one-time, purchased "+x.purchasedLocalDate:
 " owner-approved per month")+
 ". RECEIPT NOT YET VERIFIED. "+x.basis);
const approvedHtml=PROJECT_PROVISIONAL_COSTS.map(x=>
 '<tr><td style="padding:10px;border-bottom:1px solid #524450;vertical-align:top;color:#ddd3df;font-size:13px">'+
 esc(x.vendor+" — "+x.item)+
 '</td><td style="padding:10px;border-bottom:1px solid #524450;vertical-align:top;color:#ffd4e0;font-size:13px;font-weight:bold">'+
 "$"+x.ownerApprovedUsd.toFixed(2)+
 (x.category==="one_time"?" once (owner-approved)":" / month (owner-approved)")+
 '<div style="color:#c0b6be;font-weight:normal;font-size:11px;line-height:1.5;margin-top:6px">Invoice confirmation pending</div></td></tr>'
).join("");
const itemList=(items,empty)=>items.length?items.map(i=>
 '<li style="margin-bottom:8px"><a style="color:#f6b4c4" href="'+esc(i.url)+'">#'+
 i.number+' '+esc(i.title)+'</a></li>').join(""):'<li>'+esc(empty)+'</li>';
export function renderProgressEmail({now=new Date(),progress}){
 if(!progress||!Array.isArray(progress.completed)||!Array.isArray(progress.pending))
  throw Error("Verified project progress unavailable");
 const day=centralDay(now);
 const moneyNote="Owner-approved Apex cost baseline: $29.99 one-time domain registration plus $23.97/month Proton Mail. These are accepted project budget figures, NOT independently verified paid invoices. Other Apex-specific billed expenses remain unverified. Vercel team billing is shared and provider invoices require dated evidence.";
 const firstMonthBudgetUsd=PROJECT_PROVISIONAL_COSTS.reduce((sum,x)=>sum+x.ownerApprovedUsd,0);
 const done=progress.completed.map(p=>"PR #"+p.number+": "+p.title+" ("+p.url+")");
 const next=progress.pending.map(i=>"Issue #"+i.number+": "+i.title+" ("+i.url+")");
 const text=[
  "APEX ANABOLICS — WEEKLY PROJECT PROGRESS & EXPENSE REPORT",
  "Date: "+day+" (America/Chicago)","",
  "COMPLETED IN THE LAST 7 DAYS",
  ...(done.length?done:["No confirmed merges in the scanned week."]),"",
  "OPEN PRIORITIES / WHAT IS LEFT",
  ...(next.length?next:["No open priority issues returned."]),"",
  "EXPENSE REPORT — DATA COVERAGE",moneyNote,
  "OWNER-APPROVED PROJECT COST BASELINE",...approvedLines,
  "Combined initial budget basis (domain once + one month email): $"+firstMonthBudgetUsd.toFixed(2)+". This is a budget planning figure, not a paid invoice total.",
  "Vercel team billing: Not connected to this job and not allocated to Apex.",
  "Supabase, Proton, Resend and domain invoices: Not connected to this job.",
  "Unverified or forecast amounts must not be counted as actual Apex expenses.","",
  "NEXT ACTION: Review the highest-priority open issue before making production changes.",
  "Full progress/expense tracker: "+REPO_URL+"/issues/222",
  progress.scanLimited?"Warning: One source reached the page cap; status may be incomplete.":"",
  "","No live checkout, shipping, payment or inventory settings were changed."
 ].filter(Boolean).join("\n");
 const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
 '<body style="margin:0;background:#0f0e13;color:#f2f1f5;font-family:Arial,Helvetica,sans-serif;">'+
 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0e13;padding:14px 8px"><tr><td align="center">'+
 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#1b1920;border:1px solid #534452;border-radius:12px"><tr><td style="padding:23px;border-bottom:3px solid #942d4a">'+
 '<div style="font-size:12px;letter-spacing:3px;font-weight:bold">APEX <span style="color:#edaabb">ANABOLICS</span></div>'+
 '<h1 style="color:#fff;font-size:23px;margin:15px 0 6px">Weekly Progress &amp; Expenses</h1>'+
 '<p style="color:#c6c0c8;font-size:13px;margin:0">'+esc(day)+' · Central Time</p></td></tr><tr><td style="padding:22px">'+
 '<h2 style="font-size:18px;color:#fff">Completed this week</h2><ul style="line-height:1.65;padding-left:21px">'+
 itemList(progress.completed,"No verified merges found in the scanned window.")+'</ul>'+
 '<h2 style="font-size:18px;color:#fff;margin-top:22px">What is left</h2><ul style="line-height:1.65;padding-left:21px">'+
 itemList(progress.pending,"No open priority issues returned.")+'</ul>'+
 '<h2 style="font-size:18px;color:#fff;margin-top:22px">Expense report</h2>'+
 '<div style="background:#2d232b;border:1px solid #65485a;border-radius:9px;padding:14px">'+
 '<strong style="color:#ffd0df">Owner-approved costs — invoices pending</strong>'+
 '<p style="line-height:1.65;color:#d4cbd2;font-size:13px">'+esc(moneyNote)+'</p></div>'+

 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #574553;border-collapse:collapse;margin-top:13px">'+
 '<tr><th style="padding:10px;color:#edd2df;text-align:left;font-size:12px">Vendor / item</th>'+
 '<th style="padding:10px;color:#edd2df;text-align:left;font-size:12px">Owner-approved cost</th></tr>'+
 approvedHtml+'</table>'+
 '<p style="font-size:12px;color:#c9b6c4;line-height:1.6">Owner-approved planning basis: <strong>$'+firstMonthBudgetUsd.toFixed(2)+'</strong> (one domain registration plus one month of Proton). This is not a confirmed paid expense total. Domain renewal and actual Proton invoices require reconciliation before being marked paid.</p>'+
 '<p style="font-size:13px;line-height:1.7;color:#c9bfc9">Billing evidence needed: project-attributed Vercel charges, Supabase invoices, Proton invoices, Resend charges and domain receipts. Shared charges and owner-approved budget amounts cannot be added as receipt-verified Apex actuals.</p>'+
 '<a href="'+REPO_URL+'/issues/222" style="display:inline-block;background:#922a47;color:#fff;text-decoration:none;padding:12px 17px;border-radius:8px;font-size:14px;font-weight:bold">Progress &amp; Expense Tracker</a>'+
 (progress.scanLimited?'<p style="color:#ffbfca;font-size:12px">Partial source window: results may be incomplete.</p>':"")+
 '</td></tr><tr><td style="padding:16px;text-align:center;color:#a7a1ac;font-size:12px;border-top:1px solid #48424c">Owner-only Apex project digest · No customer records</td></tr></table></td></tr></table></body></html>';
 return Object.freeze({
  subject:"Apex Weekly Progress + Expense Report | "+day,
  text,html,
  idempotencyKey:"apex-owner-weekly-progress-"+day,
 });
}
