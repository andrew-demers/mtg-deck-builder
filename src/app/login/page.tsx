"use client";

import { useActionState } from "react";
import Button from "@/components/button";
import { loginAction, type LoginActionState } from "./actions";

const initialState: LoginActionState = { error: null };

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="font-display text-3xl tracking-wide">Log in</h1>
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Email</span>
          <input name="email" type="email" required className="input" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Password</span>
          <input name="password" type="password" required minLength={8} className="input" />
        </label>
        {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        <Button type="submit" disabled={isPending} className="px-7 py-3">
          {isPending ? "Logging in..." : "Log in"}
        </Button>
      </form>
    </main>
  );
}
