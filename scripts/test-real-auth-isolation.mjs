// Manual test only AFTER two approved synthetic Supabase Auth accounts
// have been created and assigned to two distinct synthetic suppliers.
// Uses real password sign-in and real authenticated RLS; NEVER mutates tables.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const credentials = [
  { email: process.env.APEX_TEST_A_EMAIL, password: process.env.APEX_TEST_A_PASSWORD },
  { email: process.env.APEX_TEST_B_EMAIL, password: process.env.APEX_TEST_B_PASSWORD },
];
if (url !== "https://fhqpkpztercadcxspdkg.supabase.co" ||
  !key?.startsWith("sb_publishable_") ||
  credentials.some(({ email, password }) => !email || !password)) {
  throw new Error("Supply Apex URL, publishable key and two test identities through local environment variables.");
}
const clients = credentials.map(() => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}));
try {
  const userIds = [];
  const supplierIds = [];
  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    const { error } = await client.auth.signInWithPassword(credentials[i]);
    assert.ifError(error);
    const { data, error: userError } = await client.auth.getUser();
    assert.ifError(userError);
    assert.ok(data.user?.id && !data.user.is_anonymous);
    userIds.push(data.user.id);

    const { data: memberships, error: membershipError } =
      await client.from("supplier_memberships").select("supplier_id");
    assert.ifError(membershipError);
    assert.equal(memberships?.length, 1, "Each test account needs exactly one supplier membership");
    supplierIds.push(memberships[0].supplier_id);
  }
  assert.notEqual(userIds[0], userIds[1], "Two distinct Auth users required");
  assert.notEqual(supplierIds[0], supplierIds[1], "Two distinct suppliers required");

  for (let i = 0; i < clients.length; i++) {
    const { data: own, error: ownError } =
      await clients[i].from("suppliers").select("id").eq("id", supplierIds[i]);
    const { data: other, error: otherError } =
      await clients[i].from("suppliers").select("id").eq("id", supplierIds[1 - i]);
    assert.ifError(ownError);
    assert.ifError(otherError);
    assert.equal(own?.length, 1, "Own supplier must be readable");
    assert.equal(other?.length, 0, "Other supplier must be inaccessible");

    const { data: otherMembership, error: privateError } =
      await clients[i].from("supplier_memberships").select("user_id").eq("user_id", userIds[1 - i]);
    assert.ifError(privateError);
    assert.equal(otherMembership?.length, 0, "Other user's membership must be invisible");
  }
  console.log("PASS: genuine Auth sign-in and cross-supplier RLS isolation.");
} finally {
  await Promise.allSettled(clients.map(c => c.auth.signOut()));
}
