// Private supplier catalog UX only. The server-side readiness checks and
// database RPC remain authoritative; no client label grants publication.
const SETUP_STEPS=8;
const safeMissing=status=>Array.isArray(status?.missing)
 ?status.missing.filter(label=>typeof label==="string"&&label.trim()).slice(0,SETUP_STEPS):[];

export function privateBulkReadiness(row,status,requestRecorded=false){
 if(!row?.id)return {
  kind:"unsaved",label:"New draft · not saved",
  description:"Save this draft before adding images, stock or requesting publication.",
  missing:[],completed:null,total:SETUP_STEPS,
 };
 if(row.needsSave)return {
  kind:"unsaved",label:"Unsaved edits",
  description:"Save your current edits before relying on the product readiness status.",
  missing:[],completed:null,total:SETUP_STEPS,
 };
 if(!status||status.kind==="unavailable")return {
  kind:"unavailable",label:"Status unavailable",
  description:"Private readiness could not be verified. Refresh before requesting publication.",
  missing:[],completed:null,total:SETUP_STEPS,
 };
 const missing=safeMissing(status),completed=Math.max(0,SETUP_STEPS-missing.length);
 if(status.kind==="hold")return {
  kind:"hold",label:"Administrative hold",
  description:"An administrator must clear this hold. Completing setup fields alone will not release it.",
  missing,completed,total:SETUP_STEPS,
 };
 if(status.kind==="review")return {
  kind:"review",label:"Admin review required",
  description:"An administrator must clear the review gate before a new private publication request.",
  missing,completed,total:SETUP_STEPS,
 };
 if(status.requested===true||requestRecorded)return {
  kind:"requested",label:"Request recorded · private",
  description:"The private publication request was recorded. This product is not publicly listed.",
  missing,completed,total:SETUP_STEPS,
 };
 if(missing.length>0)return {
  kind:"setup",label:`Draft setup ${completed}/${SETUP_STEPS}`,
  description:"Complete the missing draft fields, save your changes and recheck readiness.",
  missing,completed,total:SETUP_STEPS,
 };
 if(status.canRequest===true)return {
  kind:"ready",label:"Ready to request · private",
  description:"Draft details are complete for a private request. This is not approval for public sales.",
  missing,completed,total:SETUP_STEPS,
 };
 return {
  kind:"unavailable",label:"Request unavailable",
  description:"Private request eligibility could not be confirmed. Refresh and check administrator controls.",
  missing,completed,total:SETUP_STEPS,
 };
}
