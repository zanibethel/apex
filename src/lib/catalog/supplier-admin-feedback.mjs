// Only show the current supplier-visible administrative restriction.
// The signed-in supplier's store-scoped SELECT policy controls access to the
// source row. This display helper never authorizes or changes publication.
export function supplierAdminFeedback(listing){
 if(!listing||!["hold","review"].includes(listing.kind))return null;
 const note=typeof listing.reason==="string"?listing.reason.trim().slice(0,1000):"";
 return {
  kind:listing.kind,
  heading:listing.kind==="hold"?"Hold reason":"Review required",
  message:note||"No specific reason was provided. Contact your platform administrator for guidance.",
  hasNote:Boolean(note),
 };
}
