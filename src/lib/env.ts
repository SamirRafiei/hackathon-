import { z } from "zod";

const publicSupabaseSchema = z.object({
  url: z.url(),
  publishableKey: z.string().min(1),
});

// Validate only when a Supabase client is created, not when the starter builds.
export function getSupabaseEnv() {
  const result = publicSupabaseSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!result.success) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.",
    );
  }

  return result.data;
}
