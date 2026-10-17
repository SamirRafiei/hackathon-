"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const idempotencyKey = z.string().trim().min(1).max(200);
const createInput = z
  .object({
    assetType: z.enum(["APARTMENT", "EQUIPMENT"]),
    title: z.string().trim().min(1).max(200),
    address: z.string().trim().min(1).max(240),
    tenantEmail: z.email().trim().toLowerCase(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    amountMinor: z.number().int().min(100).max(100_000_000),
    terms: z.string().trim().min(10).max(20_000),
    idempotencyKey,
  })
  .strict()
  .refine((input) => input.endDate > input.startDate, {
    path: ["endDate"],
    message: "The end date must be after the start date.",
  });
const claimInput = z
  .object({ invitationToken: z.string().min(32).max(128), idempotencyKey })
  .strict();
const acceptInput = z
  .object({
    agreementId: z.uuid(),
    versionId: z.uuid(),
    expectedRevision: z
      .string()
      .regex(/^(0|[1-9][0-9]*)$/)
      .max(19),
    idempotencyKey,
  })
  .strict();

type RpcResult =
  | { ok: true; replayed: boolean; data: Record<string, Json> }
  | {
      ok: false;
      error: { code: string; message: string; retryable: boolean };
    };

function unavailable(message: string): RpcResult {
  return {
    ok: false,
    error: { code: "temporarily_unavailable", message, retryable: true },
  };
}

async function authenticatedClient(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; result: RpcResult }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email_confirmed_at) {
    return {
      ok: false,
      result: {
        ok: false,
        error: {
          code: "not_authenticated",
          message: "Sign in with a verified email to continue.",
          retryable: false,
        },
      },
    };
  }

  const metadataName = data.user.user_metadata?.full_name;
  const { data: profileResult, error: profileError } = await supabase.rpc(
    "ensure_profile",
    {
      p_display_name:
        typeof metadataName === "string"
          ? metadataName.slice(0, 100).trim()
          : null,
    },
  );
  const profileOutcome = profileResult as RpcResult | null;
  if (profileError || !profileOutcome || !profileOutcome.ok) {
    return {
      ok: false,
      result:
        profileError || !profileOutcome
          ? unavailable("Could not prepare your Pact profile.")
          : profileOutcome,
    };
  }
  return { ok: true, supabase };
}

export async function createAgreement(input: unknown): Promise<RpcResult> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_failed",
        message: "Check the agreement details and try again.",
        retryable: false,
      },
    };
  }
  const session = await authenticatedClient();
  if (!session.ok) return session.result;
  const { data, error } = await session.supabase.rpc("create_agreement", {
    p_input: { ...parsed.data, amountMinor: String(parsed.data.amountMinor) },
  });
  if (error || !data || typeof data !== "object") {
    return unavailable("Could not create the agreement.");
  }
  return data as RpcResult;
}

export async function claimInvitation(input: unknown): Promise<RpcResult> {
  const parsed = claimInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_failed",
        message: "The invitation details are invalid.",
        retryable: false,
      },
    };
  }
  const session = await authenticatedClient();
  if (!session.ok) return session.result;
  const { data, error } = await session.supabase.rpc("claim_invitation", {
    p_input: parsed.data,
  });
  if (error || !data || typeof data !== "object") {
    return unavailable("Could not claim this invitation.");
  }
  return data as RpcResult;
}

export async function acceptAgreementVersion(
  input: unknown,
): Promise<RpcResult> {
  const parsed = acceptInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_failed",
        message: "The acceptance details are invalid.",
        retryable: false,
      },
    };
  }
  const session = await authenticatedClient();
  if (!session.ok) return session.result;
  const { data, error } = await session.supabase.rpc(
    "accept_agreement_version",
    { p_input: parsed.data },
  );
  if (error || !data || typeof data !== "object") {
    return unavailable("Could not record acceptance.");
  }
  return data as RpcResult;
}
