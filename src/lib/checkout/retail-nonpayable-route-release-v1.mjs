/**
 * Customer admission release contract. Code deployment is NOT authorization
 * to accept buyer PII or create inventory holds.
 *
 * Both explicit, server-only settings are required; a missing or ambiguous
 * value always leaves customer submission disabled. The database engine gate
 * is independently default OFF and must be reviewed separately.
 */
export function isRetailNonpayableSubmissionEnabledV1(env){
 return Boolean(env&&typeof env==="object"&&
  env.APEX_RETAIL_NONPAYABLE_SUBMISSION_ENABLED==="true"&&
  env.APEX_RETAIL_NONPAYABLE_OPERATOR_APPROVAL==="nonpayable-only-v1");
}
