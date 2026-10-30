"use client";
import { useActionState } from "react";
import { signInAccount, type AccountSignInState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signInAccount, { error: "" } as AccountSignInState);
  return <form action={action} className="supplier-form">
    <label htmlFor="apex-email">Email</label>
    <input id="apex-email" name="email" type="email" autoComplete="username" maxLength={254} required />
    <label htmlFor="apex-password">Password</label>
    <input id="apex-password" name="password" type="password" autoComplete="current-password" required />
    <button className="button primary" type="submit" disabled={pending}>{pending ? "Signing in…" : "Log in"}</button>
    {state.error && <p role="alert" className="supplier-error">{state.error}</p>}
  </form>;
}
