import {importDefaultDescription} from "./import-default-descriptions.mjs";

// Preparing a private card is not an identity or product eligibility claim.
// Some supplier names have no curated research summary; keep a neutral placeholder.
export function privateSourceDraftDescription(name,strength){
 if(typeof name!=="string"||typeof strength!=="string")return null;
 const title=[name.trim(),strength.trim()].join(" — ");
 if(!name.trim()||!strength.trim()||title.length>120)return null;
 const documented=importDefaultDescription(name,strength);
 if(documented)return documented;
 return `Supplier-provided entry: ${title}. Chemical identity, composition, concentration,
 packaging and handling specifications for this source have not been independently
 verified. This is an editable private preparation record, not a public sale listing.`
  .replace(/\s+/g," ").trim();
}
