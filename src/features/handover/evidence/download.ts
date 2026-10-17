import { z } from "zod";

/** The signedDownload implementation for an authenticated evidence gateway.
 * Fetch a new link for each preview/download; never save links in agreement data.
 */
export async function signedEvidenceDownload(
  fileId: string,
): Promise<{ url: string }> {
  if (!z.uuid().safeParse(fileId).success)
    throw new Error("The evidence ID is invalid.");

  const response = await fetch(`/api/evidence/${fileId}/download`, {
    credentials: "same-origin",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  if (response.status === 401) throw new Error("Sign in to view evidence.");
  if (response.status === 403)
    throw new Error("Verify your email to view evidence.");
  if (response.status === 404)
    throw new Error("Evidence is unavailable or you do not have access.");
  if (!response.ok)
    throw new Error("Evidence is temporarily unavailable. Retry shortly.");

  const result = z
    .object({ url: z.url(), expiresIn: z.literal(60) })
    .safeParse(await response.json());
  if (!result.success)
    throw new Error("Could not prepare a private evidence download.");
  return { url: result.data.url };
}
