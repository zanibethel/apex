/**
 * Server-only verified user identity, resolved from a request-scoped Supabase
 * Auth client via getUser() (network-verified), never getSession() alone or
 * a browser-supplied userId, user_metadata or JWT claim.
 *
 * This implementation supports confirmed signed-in customer identities.
 * Guest checkout needs a separately designed, signed session mechanism.
 * It does NOT grant access to the private order engine or activate checkout.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deny=()=>new Error("Customer session unavailable");

export async function verifyPrivateRetailCustomerSessionV1(authClient){
 if(!authClient||typeof authClient!=="object"||
  typeof authClient.auth?.getUser!=="function")throw deny();
 let result;
 try{
  result=await authClient.auth.getUser();
 }catch{throw deny();}
 const user=result?.data?.user;
 if(result?.error||!user||
  typeof user.id!=="string"||!UUID.test(user.id)||
  user.is_anonymous===true||user.aud!=="authenticated"||
  typeof user.email_confirmed_at!=="string"||
  !Number.isFinite(Date.parse(user.email_confirmed_at))||
  typeof user.created_at!=="string"||!Number.isFinite(Date.parse(user.created_at)))
  throw deny();
 // Return only one immutable identifier, with NO contact or role claims.
 return Object.freeze({verified:true,subjectId:user.id.toLowerCase()});
}
