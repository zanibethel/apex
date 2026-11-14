/**
 * Server-only PostgreSQL connection settings. No connection is opened here.
 * The verified pooler host MUST be copied from Supabase Connect; never
 * interpolate or guess a pooler cluster index from the project region.
 * Public customer checkout and the private order gate stay disabled.
 */
const PROJECT="fhqpkpztercadcxspdkg";
const ROLE="apex_retail_checkout_app";
const fail=()=>new Error("Retail database configuration unavailable");
const HEX=/^[0-9a-f]+$/i;
const REF=/^[A-Za-z0-9_-]{5,80}$/;
const ALLOWED_PROVIDERS=new Set(["postgres:","postgresql:"]);

export function validateRetailCheckoutServerConfigV1(env){
 if(!env||typeof env!=="object"||
  typeof env.APEX_RETAIL_DB_URL!=="string"||
  typeof env.APEX_RETAIL_FINGERPRINT_KEY!=="string"||
  typeof env.APEX_RETAIL_DELIVERY_KEY_HEX!=="string"||
  typeof env.APEX_RETAIL_DELIVERY_KEY_REF!=="string")throw fail();
 let url;
 try{url=new URL(env.APEX_RETAIL_DB_URL);}catch{throw fail();}
 if(!ALLOWED_PROVIDERS.has(url.protocol)||
  !url.username||!url.password||url.hash||url.search||
  url.pathname!=="/postgres"||
  (url.port!=="5432"&&url.port!=="6543"))throw fail();
 const host=url.hostname.toLowerCase();
 const shared=host.endsWith(".pooler.supabase.com")&&
  /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host);
 const direct=host==="db."+PROJECT+".supabase.co"&&url.port==="5432";
 if(!(shared||direct)||
   decodeURIComponent(url.username)!==(shared?ROLE+"."+PROJECT:ROLE))
  throw fail();
 const fp=env.APEX_RETAIL_FINGERPRINT_KEY;
 const aes=env.APEX_RETAIL_DELIVERY_KEY_HEX;
 if(!HEX.test(fp)||fp.length<64||fp.length>128||fp.length%2!==0||
  !HEX.test(aes)||aes.length!==64||!REF.test(env.APEX_RETAIL_DELIVERY_KEY_REF))
  throw fail();
 // Return only runtime options. Do not serialize, log or expose to clients.
 return Object.freeze({
  connectionString:env.APEX_RETAIL_DB_URL,
  ssl:Object.freeze({rejectUnauthorized:true}),
  max:2,
  idleTimeoutMillis:1000,
  connectionTimeoutMillis:3500,
  statement_timeout:8000,
  fingerprintKey:fp,
  deliveryKey:Buffer.from(aes,"hex"),
  deliveryKeyReference:env.APEX_RETAIL_DELIVERY_KEY_REF,
 });
}

/** Pass the validated pool options to an injected node-postgres Pool class.
 * Production usage must supply a fully lockfile-pinned pg dependency.
 */
export function createRetailCheckoutServerPoolV1(env,Pool){
 if(typeof Pool!=="function")throw fail();
 const config=validateRetailCheckoutServerConfigV1(env);
 const {fingerprintKey,deliveryKey,deliveryKeyReference,...options}=config;
 const pool=new Pool(options);
 if(!pool||typeof pool.connect!=="function")throw fail();
 return Object.freeze({pool,fingerprintKey,deliveryKey,deliveryKeyReference});
}
