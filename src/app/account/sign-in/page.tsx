"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signInAccount, type AccountSignInState } from "./actions";

export default function AccountSignInPage() {
  const [state, action, pending] = useActionState(signInAccount, { error: "" } as AccountSignInState);
  return <main className="container supplier-shell">
    <Link href="/" className="back">← Apex home</Link>
    <section className="supplier-panel" style={{maxWidth:560,marginInline:"auto"}}>
      <p className="eyebrow">APEX / ACCOUNT</p>
      <h1 style={{fontSize:"clamp(2rem,7vw,3rem)"}}>Sign in</h1>
      <p className="notice">One sign-in for your account and any workspaces you are authorized to access.</p>
      <form action={action} className="supplier-form">
        <label htmlFor="account-email">Email</label>
        <input id="account-email" name="email" type="email" autoComplete="username" maxLength={254} required />
        <label htmlFor="account-password">Password</label>
        <input id="account-password" name="password" type="password" autoComplete="current-password" required />
        <p className="notice"><Link href="/account/forgot-password">Forgot password?</Link></p>
        <button className="button primary" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        {state.error && <p role="alert" className="supplier-error">{state.error}</p>}
      </form>
      <p className="notice">Supplier and administrator access is invitation-only. Customer registration requires email verification.</p>
      <p className="notice"><Link href="/account/sign-up">New customer? Create an account</Link></p>
    </section>
  </main>;
}
