"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp } from "@/features/auth/server/actions";

type Props = { mode: "login" | "signup"; next: string; message?: string };

export function AuthForm({ mode, next, message }: Props) {
  const action = mode === "login" ? signIn : signUp;
  const [state, formAction, pending] = useActionState(action, {});
  const otherMode = mode === "login" ? "signup" : "login";
  const otherLabel = mode === "login" ? "Create an account" : "Sign in";
  const otherHref = `/${otherMode}?next=${encodeURIComponent(next)}`;

  return (
    <main className="auth-page">
      <section aria-labelledby="auth-title" className="auth-card">
        <Link className="auth-brand" href="/">
          Pact
        </Link>
        <p className="auth-kicker">SECURE AGREEMENT WORKSPACE</p>
        <h1 id="auth-title">
          {mode === "login" ? "Sign in to Pact" : "Create your Pact account"}
        </h1>
        <p className="auth-intro">
          Use a verified email to create agreements or accept an invitation.
          Your sign-in is for this Pact demo and is not a bank login.
        </p>
        {message && (
          <p className="auth-message" role="status">
            {message}
          </p>
        )}
        {state.error && (
          <p className="auth-error" role="alert">
            {state.error}
          </p>
        )}
        {state.message && (
          <p className="auth-message" role="status">
            {state.message}
          </p>
        )}
        <form action={formAction} className="auth-form">
          <input name="next" type="hidden" value={next} />
          {mode === "signup" && (
            <>
              <label htmlFor="displayName">Name</label>
              <input
                autoComplete="name"
                id="displayName"
                maxLength={100}
                name="displayName"
                required
              />
            </>
          )}
          <label htmlFor="email">Email</label>
          <input
            autoComplete="email"
            id="email"
            name="email"
            required
            type="email"
          />
          <label htmlFor="password">Password</label>
          <input
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            id="password"
            minLength={mode === "signup" ? 10 : undefined}
            name="password"
            required
            type="password"
          />
          <button className="auth-submit" disabled={pending} type="submit">
            {pending
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
        <p className="auth-switch">
          {mode === "login" ? "New to Pact?" : "Already have an account?"}{" "}
          <Link href={otherHref}>{otherLabel}</Link>
        </p>
        <p className="auth-disclaimer">
          Demo only. Funding and settlement are simulated; no money moves.
        </p>
      </section>
    </main>
  );
}
