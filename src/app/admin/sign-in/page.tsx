"use client";
import { useActionState } from "react";
import { signInAdmin, type AdminState } from "./actions";

export default function AdminSignIn() {
  const [state, submit, pending] = useActionState(signInAdmin, { error: "" } as AdminState);
  return (
    <main className="container supplier-shell">
      <section className="supplier-panel">
        <p className="eyebrow">APEX / PRIVATE DEMO</p>
        <h1>Administrator sign in</h1>
        <form action={submit} className="supplier-form">
          <label htmlFor="admin-email">Email</label>
          <input id="admin-email" name="email" type="email" required />
          <label htmlFor="admin-password">Password</label>
          <input id="admin-password" name="password" type="password" required />
          <button className="button primary" type="submit" disabled={pending}>Sign in</button>
          {state.error && <p role="alert" className="supplier-error">{state.error}</p>}
        </form>
      </section>
    </main>
  );
}
