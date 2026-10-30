"use client";

import { useActionState, useId } from "react";
import {
  adjustInventory, createDraftCategory, createDraftProduct,
  requestWalletDestination, updateDraftProduct,
} from "./actions";

const initial = { ok:false, message:"" };

export function NewProductForm({storeId,enabled}:{storeId:string;enabled:boolean}) {
  const [state,action,pending]=useActionState(createDraftProduct,initial);
  return <section className="supplier-panel" style={{maxWidth:"none"}}>
    <h2>Create draft product</h2>
    <p className="notice">Product creation is private. Nothing is published to customers.</p>
    <form action={action} className="supplier-form">
      <input type="hidden" name="storeId" value={storeId}/>
      <label htmlFor="draft-product-name">Name</label>
      <input id="draft-product-name" name="name" maxLength={120} required disabled={!enabled}/>
      <label htmlFor="draft-product-sku">SKU</label>
      <input id="draft-product-sku" name="sku" maxLength={60} required disabled={!enabled}/>
      <label htmlFor="draft-product-price">Price (USD)</label>
      <input id="draft-product-price" name="price" type="number" min="0" max="9999999.99" step=".01" required disabled={!enabled}/>
      <label htmlFor="draft-product-description">Description</label>
      <textarea id="draft-product-description" name="description" maxLength={1500} rows={3} disabled={!enabled}/>
      <button type="submit" className="button primary" disabled={!enabled||pending}>{pending?"Saving…":"Create draft"}</button>
    </form>
    {state.message && <p role="status">{state.message}</p>}
    {!enabled && <p className="notice">Draft editing is locked until the write-policy migration passes review.</p>}
  </section>;
}

export function NewCategoryForm({storeId,enabled}:{storeId:string;enabled:boolean}) {
  const [state,action,pending]=useActionState(createDraftCategory,initial);
  return <section className="supplier-panel">
    <h2>Add category</h2>
    <form action={action} className="supplier-form">
      <input type="hidden" name="storeId" value={storeId}/>
      <label htmlFor="category-name">Category name</label>
      <input id="category-name" name="name" maxLength={80} required disabled={!enabled}/>
      <button type="submit" className="button secondary" disabled={!enabled||pending}>Add draft category</button>
    </form>
    {state.message && <p role="status">{state.message}</p>}
  </section>;
}

export function ProductRowEditor({storeId,productId,name,price,enabled}:{
  storeId:string;productId:string;name:string;price:string;enabled:boolean;
}) {
  const [state,action,pending]=useActionState(updateDraftProduct,initial);
  const uid=useId();
  return <form action={action} className="supplier-form" style={{marginTop:6}}>
    <input type="hidden" name="storeId" value={storeId}/>
    <input type="hidden" name="productId" value={productId}/>
    <label htmlFor={uid+"n"}>Draft name</label>
    <input id={uid+"n"} name="name" defaultValue={name} maxLength={120} required disabled={!enabled}/>
    <label htmlFor={uid+"p"}>USD price</label>
    <input id={uid+"p"} name="price" defaultValue={price} type="number" min="0" step=".01" max="9999999.99" required disabled={!enabled}/>
    <button type="submit" className="button secondary" disabled={!enabled||pending}>Save product</button>
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}

export function StockEditor({storeId,productId,quantity,enabled}:{
  storeId:string;productId:string;quantity:number;enabled:boolean;
}) {
  const [state,action,pending]=useActionState(adjustInventory,initial);
  const uid=useId();
  return <form action={action} className="supplier-form" style={{marginTop:8}}>
    <input type="hidden" name="storeId" value={storeId}/>
    <input type="hidden" name="productId" value={productId}/>
    <input type="hidden" name="expectedOnHand" value={quantity}/>
    <label htmlFor={uid}>Set on-hand quantity</label>
    <input id={uid} name="quantityOnHand" type="number" min="0" max="1000000" step="1"
      defaultValue={quantity} required disabled={!enabled}/>
    <button className="button secondary" type="submit" disabled={!enabled||pending}>Save stock</button>
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}

export function WalletRequestForm({storeId,enabled}:{storeId:string;enabled:boolean}) {
  const [state,action,pending]=useActionState(requestWalletDestination,initial);
  return <section className="supplier-panel" style={{maxWidth:"none"}}>
    <h2>Request test wallet destination</h2>
    <p className="notice">Signet only. Addresses are not activated and no payouts are sent.</p>
    <form action={action} className="supplier-form">
      <input type="hidden" name="storeId" value={storeId}/>
      <label htmlFor="wallet-label">Wallet label</label>
      <input id="wallet-label" name="label" maxLength={80} required disabled={!enabled}/>
      <label htmlFor="wallet-address">Bitcoin signet address</label>
      <input id="wallet-address" name="address" minLength={23} maxLength={90}
        placeholder="tb1…" autoComplete="off" required disabled={!enabled}/>
      <button type="submit" className="button secondary" disabled={!enabled||pending}>Submit wallet request</button>
    </form>
    {state.message && <p role="status">{state.message}</p>}
    {!enabled && <p className="notice">Wallet requests are disabled until test-network verification is configured.</p>}
  </section>;
}
