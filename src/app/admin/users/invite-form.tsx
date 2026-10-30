"use client";

import { useActionState } from "react";
import { inviteAccount, type InviteResult } from "./actions";

const initial: InviteResult = { ok: false, message: "" };

export function InviteAccountForm({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(inviteAccount, initial);
  return (
    <>
      <p className="notice">Invitations create ordinary login users, never administrators.</p>
      <form action={action} className="supplier-form">
        <label htmlFor="new-user-email">New account email address</label>
        <input id="new-user-email" name="email" type="email" maxLength={254} autoComplete="off" disabled={!enabled} required />
        <button className="button primary" type="submit" disabled={!enabled || pending}>
          {pending ? "Requesting invitation…" : "Send invitation"}
        </button>
        {state.message && <p role="status" className={state.ok ? "notice" : "supplier-error"}>{state.message}</p>}
      </form>
      {!enabled && <p className="notice">Invitation sending is temporarily locked until approved SMTP and server-side credentials are ready.</p>}
    </>
  );
}
