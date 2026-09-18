"use client";

import { useActionState } from "react";
import { changePasswordAction, type PwState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PwState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="space-y-3">
      <input name="current" type="password" className="input" placeholder="Current password" autoComplete="current-password" required />
      <input name="next" type="password" className="input" placeholder="New password (min 6)" autoComplete="new-password" minLength={6} required />
      <input name="confirm" type="password" className="input" placeholder="Repeat new password" autoComplete="new-password" required />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
