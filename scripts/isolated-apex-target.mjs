// Client-side guard for an isolated QA fixture.
// Keep independent of Supabase SDK so it can be tested without credentials.
export const PRODUCTION_APEX_REF = "fhqpkpztercadcxspdkg";
const refPattern = /^[a-z]{20}$/;

export function assertIsolatedApexTarget(env = process.env) {
  const ref = env.APEX_TEST_SUPABASE_REF;
  const url = env.APEX_TEST_SUPABASE_URL;
  if (env.APEX_TEST_EXECUTION !== "isolated-fixture-only") {
    throw Error("Refusing fixture: explicit isolated test opt-in is missing.");
  }
  if (!refPattern.test(ref ?? "") || ref === PRODUCTION_APEX_REF) {
    throw Error("Refusing fixture: test project reference missing or matches production.");
  }
  if (url !== "https://" + ref + ".supabase.co") {
    throw Error("Refusing fixture: URL does not exactly match the isolated project reference.");
  }
  if (!env.APEX_TEST_SUPABASE_PUBLISHABLE_KEY ||
      !env.APEX_TEST_SUPABASE_SERVICE_ROLE_KEY) {
    throw Error("Refusing fixture: isolated test keys not configured.");
  }
  return {ref, url, publishableKey:env.APEX_TEST_SUPABASE_PUBLISHABLE_KEY,
    adminKey:env.APEX_TEST_SUPABASE_SERVICE_ROLE_KEY};
}
