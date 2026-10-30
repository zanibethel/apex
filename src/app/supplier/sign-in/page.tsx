"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signInSupplier, type SignInState } from "./actions";

const initialState: SignInState = { error: "" };
export default function SupplierSignIn() {
  const [state, action, pending] = useActionState(signInSupplier, initialState);
  return (
    <main className="container supplier-shell">
      <Link href="/" className="back">← Apex home</Link>
      <section className="supplier-panel">
        <p className="eyebrow">SUPPLIER PORTAL / PRIVATE PREVIEW</p>
        <h1>Supplier sign in.</h1>
        <p className="lead">Access is by invitation and verified supplier membership only. No public registration or sales are enabled.</p>
        <form action={action} className="supplier-form">
          <label htmlFor="supplier-email">Email</label>
          <input id="supplier-email" name="email" type="email" autoComplete="username" maxLength={254} required />
          <label htmlFor="supplier-password">Password</label>
          <input id="supplier-password" name="password" type="password" autoComplete="current-password" required />
          <button className="button primary" type="submit" disabled={pending}>{pending ? "Checking access…" : "Sign in securely"}</button>
          {state.error && <p role="alert" className="supplier-error">{state.error}</p>}
        </form>
        <p className="notice">Need access? Contact the administrator. No public account registration is available.</p>
      </section>
    </main>
  );
}
