"use client";
import { useActionState } from "react";
import { changeOwnPassword } from "./actions";

export function ProfileForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, {ok:false, message:""});
  return <form action={action}><button type="submit" disabled={pending}>Update password</button><p>{state.message}</p></form>;
}
