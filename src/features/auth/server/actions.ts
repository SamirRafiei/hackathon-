"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/navigation";
import { createClient } from "@/lib/supabase/server";

type AuthState = { error?: string; message?: string };

export async function signIn(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const rawNext = formData.get("next");
  const next = safeNextPath(typeof rawNext === "string" ? rawNext : null);
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error)
    return { error: "Sign-in failed. Check your details and try again." };
  redirect(next);
}

export async function signUp(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const rawNext = formData.get("next");
  const next = safeNextPath(typeof rawNext === "string" ? rawNext : null);
  if (
    displayName.length < 1 ||
    displayName.length > 100 ||
    !email ||
    password.length < 10
  ) {
    return {
      error:
        "Enter your name, a valid email, and a password of at least 10 characters.",
    };
  }

  const requestHeaders = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    requestHeaders.get("origin") ??
    "http://localhost:3000";
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", next);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: displayName },
      emailRedirectTo: callback.toString(),
    },
  });
  if (error) {
    return {
      error: "Could not create the account. Check the email and try again.",
    };
  }
  if (data.session) redirect(next);
  return {
    message:
      "Check your email to verify the account, then sign in to continue.",
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
