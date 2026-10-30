"use client";
import Link from "next/link";
import { useActionState } from "react";
import { changeOwnPassword } from "./actions";

export function ProfileForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, { ok: false, message: "" });
  return <section className="supplier-panel">
    <h2>Change Apex password</h2>
    <p className="notice">Your Proton email password is separate. Use a unique password of at least 12 characters.</p>
    {!state.ok && <form action={action} className="supplier-form">
      <label htmlFor="oldPassword">Current password</label>
      <input id="oldPassword" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} />
      <label htmlFor="newPassword">New password</label>
      <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      <label htmlFor="confirmPassword">Confirm new password</label>
      <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      <label htmlFor="nonce">Security code (if required)</label>
      <input id="nonce" name="nonce" type="text" pattern="[0-9]{6}" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Optional 6-digit code" />
      <button className="button primary" type="submit" disabled={pending}>{pending ? "Updating…" : "Save new password"}</button>
    </form>}
    {state.message && <p role="status" className={state.ok ? "notice" : "supplier-error"}>{state.message}</p>}
    {state.ok && <Link className="button primary" href="/admin/sign-in">Sign in again</Link>}
    <p className="notice">Changing your password signs you out of Apex. Password recovery by email will be added after SMTP configuration.</p>
  </section>;
}
