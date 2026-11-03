/**
 * Read-only display classification of server-fetched, admin-RLS-protected
 * payment reporting rows. Never treats ledger state as Bitcoin settlement
 * proof, and never grants invoice, recovery or payout permissions.
 */
const RULE_STATES=new Set(["draft","scheduled","active","paused","archived"]);
const TRANSFER_STATES=new Set(["pending","submitted","confirmed","failed","reversed"]);

function inspect(rows,validStates){
 if(!Array.isArray(rows))return Object.freeze({
  available:false,shown:null,states:Object.freeze({}),unrecognized:0,
 });
 const states={};
 let unrecognized=0;
 for(const row of rows){
  const state=row&&typeof row==="object"&&
    typeof row.status==="string"?row.status:
    row&&typeof row==="object"&&typeof row.state==="string"?row.state:null;
  if(state&&validStates.has(state))states[state]=(states[state]||0)+1;
  else unrecognized++;
 }
 return Object.freeze({
  available:true,shown:rows.length,
  states:Object.freeze(states),unrecognized,
 });
}
export function summarizeAdminPaymentMonitor({rules,transfers,snapshots}={}){
 const rule=inspect(rules,RULE_STATES);
 const transfer=inspect(transfers,TRANSFER_STATES);
 const snapshotsAvailable=Array.isArray(snapshots);
 return Object.freeze({
  rules:rule,transfers:transfer,
  snapshots:Object.freeze({
    available:snapshotsAvailable,
    shown:snapshotsAvailable?snapshots.length:null,
  }),
  // A recorded "confirmed" entry is not a validated wallet receipt.
  providerSettlementVerified:false,
  providerFeedConnected:false,
  canReleaseCheckout:false,
  canCreateInvoice:false,
  canApproveRecovery:false,
  canSubmitPayout:false,
 });
}
export function recordedTransferLabel(value){
 switch(value){
  case "pending":return "Recorded pending";
  case "submitted":return "Recorded submitted";
  case "confirmed":return "Recorded confirmed (not on-chain verified)";
  case "failed":return "Recorded failed — review required";
  case "reversed":return "Recorded reversed — review required";
  default:return "Unrecognized record — review required";
 }
}
export function recordedRuleLabel(value){
 return RULE_STATES.has(value)?"Recorded "+value:"Unrecognized rule state";
}
