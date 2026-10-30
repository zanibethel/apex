"use server";

import { revalidatePath } from "next/cache";
import { createSupplierServerClient } from "@/lib/supabase/server";

type Result = { ok: boolean; message: string };
const denied: Result = { ok: false, message: "This account cannot change this storefront." };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorizedStore(form: FormData) {
  const storeId = form.get("storeId");
  if (typeof storeId !== "string" || !uuid.test(storeId)) return null;
  const client = await createSupplierServerClient();
  if (!client) return null;
  const { data: identity, error } = await client.auth.getUser();
  if (error || !identity.user || identity.user.is_anonymous || !identity.user.email_confirmed_at) return null;
  const { data: memberships, error: memberError } = await client.from("supplier_memberships")
    .select("supplier_id,role").in("role",["owner","manager"]).limit(20);
  if (memberError || !memberships?.length) return null;
  const { data: store, error: storeError } = await client.from("stores")
    .select("id,supplier_id,is_public").eq("id",storeId)
    .in("supplier_id",memberships.map(m=>m.supplier_id)).eq("is_public",false).maybeSingle();
  if (storeError || !store) return null;
  return { client, storeId, userId: identity.user.id };
}

function dollarsToCents(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || !/^\d{1,7}(\.\d{1,2})?$/.test(raw)) return null;
  const [whole,fraction=""] = raw.split(".");
  const cents = Number(whole)*100+Number(fraction.padEnd(2,"0"));
  return Number.isSafeInteger(cents) && cents <= 999999999 ? cents : null;
}

function validName(raw: FormDataEntryValue | null, max: number) {
  if (typeof raw !== "string") return null;
  const name=raw.trim();
  return name.length >= 1 && name.length <= max ? name : null;
}

export async function createDraftProduct(_previous: Result, form: FormData): Promise<Result> {
  if (process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED !== "true") return denied;
  const store = await authorizedStore(form);
  if (!store) return denied;
  const name=validName(form.get("name"),120), sku=validName(form.get("sku"),60);
  const price_cents=dollarsToCents(form.get("price"));
  const description=String(form.get("description")??"").trim().slice(0,1500);
  if (!name || !sku || price_cents === null) return {ok:false,message:"Enter a name, SKU and valid USD price."};
  const {data,error} = await store.client.from("products")
    .insert({store_id:store.storeId,name,sku,description,price_cents,currency:"USD"})
    .select("id").single();
  if (error || !data) return {ok:false,message:"Draft product was not saved. The SKU may already be in use."};
  const inventory=await store.client.from("inventory_items")
    .insert({store_id:store.storeId,product_id:data.id,quantity_on_hand:0});
  revalidatePath("/supplier/catalog"); revalidatePath("/supplier");
  return inventory.error
    ? {ok:true,message:"Draft product saved; initial stock record could not be created."}
    : {ok:true,message:"Draft product created with zero starting inventory."};
}

export async function updateDraftProduct(_previous: Result, form: FormData): Promise<Result> {
  if (process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED !== "true") return denied;
  const store = await authorizedStore(form);
  if (!store) return denied;
  const productId=form.get("productId");
  const name=validName(form.get("name"),120);
  const price_cents=dollarsToCents(form.get("price"));
  if(typeof productId!=="string" || !uuid.test(productId) || !name || price_cents===null) {
    return {ok:false,message:"Invalid product details."};
  }
  const {data,error}=await store.client.from("products")
    .update({name,price_cents})
    .eq("id",productId).eq("store_id",store.storeId).eq("is_published",false)
    .select("id").maybeSingle();
  if(error || !data) return {ok:false,message:"Draft not updated. Check your membership or product status."};
  revalidatePath("/supplier/catalog");
  return {ok:true,message:"Draft product updated."};
}

export async function createDraftCategory(_previous: Result, form: FormData): Promise<Result> {
  if (process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED !== "true") return denied;
  const store = await authorizedStore(form);
  if (!store) return denied;
  const name=validName(form.get("name"),80);
  if(!name) return {ok:false,message:"Category name required."};
  const slug=name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g,"")
    .trim().replace(/\s+/g,"-");
  if(!slug) return {ok:false,message:"Category name must include letters or numbers."};
  const {error}=await store.client.from("categories").insert({store_id:store.storeId,slug,name});
  if(error) return {ok:false,message:"Category could not be saved. It may already exist."};
  revalidatePath("/supplier/catalog");
  return {ok:true,message:"Draft category added."};
}

export async function adjustInventory(_previous: Result, form: FormData): Promise<Result> {
  if (process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED !== "true") return denied;
  const store=await authorizedStore(form);
  if(!store) return denied;
  const productId=form.get("productId");
  const expected=Number(form.get("expectedOnHand"));
  const target=Number(form.get("quantityOnHand"));
  if(typeof productId!=="string"||!uuid.test(productId) ||
     !Number.isSafeInteger(expected)||!Number.isSafeInteger(target)||
     expected<0||target<0||target>1000000||target===expected) {
    return {ok:false,message:"Enter a different valid stock quantity."};
  }
  const { data: draft, error: draftError } = await store.client.from("products")
    .select("id").eq("id", productId).eq("store_id", store.storeId)
    .eq("is_published", false).maybeSingle();
  if (draftError || !draft) return {ok:false,message:"Only private draft products can have their stock adjusted here."};

  // CAS avoids silently overwriting a colleague's concurrent inventory adjustment.
  // Database trigger atomically records before/after counts and actor.
  const {data,error}=await store.client.from("inventory_items")
    .update({quantity_on_hand:target})
    .eq("store_id",store.storeId).eq("product_id",productId)
    .eq("quantity_on_hand",expected).select("product_id").maybeSingle();
  if(error || !data) return {ok:false,message:"Stock was not updated. Refresh in case the quantity changed."};
  revalidatePath("/supplier/catalog");revalidatePath("/supplier");
  return {ok:true,message:"Inventory saved and recorded in audit history."};
}

export async function requestWalletDestination(_previous: Result, form: FormData): Promise<Result> {
  if (process.env.APEX_WALLET_REQUESTS_ENABLED !== "true") return denied;
  const store=await authorizedStore(form);
  if(!store) return denied;
  const label=validName(form.get("label"),80), address=form.get("address");
  // This is intentionally a signet-only request, not a fully verified wallet or payout destination.
  if(!label || typeof address!=="string" || !/^tb1[a-z0-9]{20,87}$/.test(address)) {
    return {ok:false,message:"Enter a label and a Bitcoin signet address (tb1…)."};
  }
  const {error}=await store.client.from("supplier_wallet_requests")
    .insert({store_id:store.storeId,label,address,created_by:store.userId});
  if(error) return {ok:false,message:"Wallet request could not be recorded."};
  revalidatePath("/supplier/wallets");
  return {ok:true,message:"Test-network wallet request recorded for review. No payout address was activated."};
}
