"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="loginId">
          Employee code or mobile
        </label>
        <input id="loginId" name="loginId" className="input py-2.5 text-base" autoComplete="username" autoCapitalize="characters" required />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input id="password" name="password" type="password" className="input py-2.5 text-base" autoComplete="current-password" required />
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn btn-primary w-full py-3 text-base" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
