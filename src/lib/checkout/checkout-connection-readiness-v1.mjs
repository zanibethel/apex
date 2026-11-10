/**
 * Read-only checkout connection inventory. Reporting existing integration state
 * only: this is NOT an order-admission or product-eligibility engine.
 * No new rules, policy lists, or new commerce capabilities.
 */
const STATUS=Object.freeze({
 connected:"Connected for read-only inspection",
 configured:"Configured; independent verification pending",
 incomplete:"Configuration or verification needed",
 unavailable:"Readback unavailable",
 foundation:"Held-only foundation available",
 disabled:"Not enabled",
});
const step=(id,label,state,detail,href)=>Object.freeze({
 id,label,state,detail,href,
});
export function buildCheckoutConnectionReportV1({
 retailShowcase,quoteFlag,journal,btcpay,
}={}){
 const providerStatus=typeof btcpay?.storeStatus==="string"?
  btcpay.storeStatus:"unavailable";
 const recipientStatus=typeof btcpay?.recipientStatus==="string"?
  btcpay.recipientStatus:"unavailable";
 const writerStatus=typeof btcpay?.writerStatus==="string"?
  btcpay.writerStatus:"unavailable";
 const providerConnected=providerStatus==="store_verified";
 const recipientDirectory=recipientStatus==="directory_only_wallets_unverified";
 const writerConfigured=writerStatus==="configured_not_authorized";
 const journalConnected=journal?.checkoutEnabled===false&&
  journal?.invoicePostEnabled===false&&
  Number.isSafeInteger(journal?.heldOrderRecords)&&
  Number.isSafeInteger(journal?.heldProviderIntents);
 const steps=[
  step("retail","Public retail showcase",
   typeof retailShowcase!=="boolean"?"unavailable":
   retailShowcase?"connected":"disabled",
   retailShowcase===true?"Catalog display is enabled; it never grants checkout.":
   retailShowcase===false?"Catalog display is currently disabled.":
   "The catalog display gate could not be checked.",
   "/admin/catalog-release"),
  step("quote","Existing public cart quote",
   quoteFlag===true?"foundation":"incomplete",
   quoteFlag===true?
   "Read-only quote feature is configured; no sale or invoice can result.":
   "Legacy public quote flag is off or unknown; the existing quote path cannot be used.",
   "/cart"),
  step("handoff","Track 1 → Track 2 request bridge",
   "foundation",
   "Versioned request parsing and HMAC preparation exist; admission is not connected.",
   "/admin/order-admission"),
  step("journal","Private order and invoice journal",
   journalConnected?"foundation":"unavailable",
   journalConnected?
   "Held-only journal readback is available; no invoice POST or purchase rights.":
   "Admin journal summary could not be independently checked.",
   "/admin/payment-monitor"),
  step("provider","BTCPay Greenfield store read",
   providerConnected?"connected":
    providerStatus==="unavailable"?"unavailable":"incomplete",
   providerConnected?
   "Store identity and USD configuration were read successfully; no invoice authority.":
   "Read-only provider status: "+providerStatus.replaceAll("_"," ")+".",
   "/admin/btcpay"),
  step("writer","BTCPay invoice writer",
   writerConfigured?"configured":"incomplete",
   writerConfigured?
    "A distinct credential is configured but not authorized or exercised.":
    "Invoice-writer status: "+writerStatus.replaceAll("_"," ")+".",
   "/admin/btcpay"),
  step("recipients","Apex / Lily / Tierra directory",
   recipientDirectory?"foundation":"incomplete",
   recipientDirectory?
   "Three active directory entries are recorded; wallet ownership not verified.":
   "Recipient status: "+recipientStatus.replaceAll("_"," ")+".",
   "/admin/recipients"),
  step("prism","Prism payout synchronization",
   "incomplete",
   "Real provider rule sync, wallet verification, reconciliation and recovery are not connected.",
   "/admin/splits/configure"),
  step("checkout","Live order and payment endpoints",
   "disabled",
   "Customer endpoint intentionally returns HTTP 503. No order or invoice creation.",
   "/admin/checkout-readiness"),
 ];
 return Object.freeze({
  steps:Object.freeze(steps),
  legend:STATUS,
  providerConnected,
  recipientDirectory,
  journalConnected,
  heldOrderRecords:journalConnected?journal.heldOrderRecords:null,
  heldProviderIntents:journalConnected?journal.heldProviderIntents:null,
  nextAction:!providerConnected?
   "Verify the single shared BTCPay store using the existing read-only connection.":
   !recipientDirectory?
    "Verify the three payout recipients and their independently controlled wallets.":
    "Implement and test the server-authoritative order-to-invoice writer, payment evidence, and recovery.",
  canCreateOrder:false,canCreateInvoice:false,canPay:false,
 });
}
