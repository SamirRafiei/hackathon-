import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Signed links are bearer capabilities. Never cache them or persist them in records.
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
const expiresIn = 60;

function failure(status: number, message: string) {
  return Response.json({ error: message }, { status, headers });
}

/** Owner: Tayma AlDabbas. Identity and storage paths come only from the server. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return failure(400, "The evidence ID is invalid.");

  try {
    // Cookie-bound client with the publishable key: RLS applies to both reads.
    // Do not substitute a service-role client or accept an actor/path from the UI.
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user)
      return failure(401, "Sign in to view evidence.");
    if (!auth.user.email_confirmed_at)
      return failure(403, "Verify your email to view evidence.");

    const { data: file, error: readError } = await supabase
      .from("evidence_files")
      .select("bucket_id, object_path")
      .eq("id", id)
      .maybeSingle();
    if (readError)
      return failure(
        503,
        "Evidence is temporarily unavailable. Retry shortly.",
      );
    // Absent and unauthorized records are intentionally indistinguishable.
    if (!file) return failure(404, "Evidence is unavailable.");

    // Storage independently rechecks participant/assigned-reviewer access.
    // Existing RLS exposes drafts only to their uploader, submitted files to
    // agreement members and assigned, non-revoked independent reviewers.
    const { data, error } = await supabase.storage
      .from(file.bucket_id)
      .createSignedUrl(file.object_path, expiresIn);
    if (error || !data?.signedUrl)
      return failure(404, "Evidence is unavailable.");

    return Response.json({ url: data.signedUrl, expiresIn }, { headers });
  } catch {
    // Configuration, provider and network failures must not leak paths or tokens.
    return failure(503, "Evidence is temporarily unavailable. Retry shortly.");
  }
}
