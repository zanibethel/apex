// Validate the narrow admin-only aggregate before presentation.
// The journal is a held-only foundation, not evidence of real purchases.
export function parseAdminCheckoutJournalSummary(input){
 if(!input||typeof input!=="object"||Array.isArray(input)||
  Object.keys(input).sort().join(",")!==
   "checkout_enabled,held_order_records,held_provider_intents,invoice_post_enabled,status"||
  input.status!=="journal_foundation"||
  !Number.isSafeInteger(input.held_order_records)||
  !Number.isSafeInteger(input.held_provider_intents)||
  input.held_order_records<0||input.held_provider_intents<0||
  input.held_provider_intents>input.held_order_records||
  input.invoice_post_enabled!==false||
  input.checkout_enabled!==false)return null;
 return Object.freeze({
  heldOrderRecords:input.held_order_records,
  heldProviderIntents:input.held_provider_intents,
  invoicePostEnabled:false,
  checkoutEnabled:false,
 });
}
