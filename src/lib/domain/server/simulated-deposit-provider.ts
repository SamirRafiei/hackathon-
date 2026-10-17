import "server-only";
import { z } from "zod";
import type {
  DepositProvider,
  OperationInput,
  OperationOutput,
  OperationResult,
} from "../contracts";
import { AGREEMENT_STATES, CURRENCIES } from "../model";
import { mutationInputSchema, participantIdSchema } from "../validation";

/** Narrow transport boundary until real Supabase database types are generated.
 * Wrap client.rpc(name, { p_input: input }) in the composition root. Do not cast
 * the empty generated Database type or use a privileged client for user operations.
 */
export type FundingRpc = (
  name:
    | "start_contribution"
    | "cancel_agreement"
    | "complete_simulated_contribution"
    | "process_due_contributions",
  args: { p_input: unknown },
) => PromiseLike<{ data: unknown; error: unknown }>;

const startSchema = mutationInputSchema.extend({
  versionId: participantIdSchema,
  contributionId: participantIdSchema,
});
const completeSchema = z
  .object({
    attemptId: participantIdSchema,
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();
const batchSchema = z
  .object({
    batchSize: z.number().int().min(1).max(100),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();
const summarySchema = z.object({
  id: participantIdSchema,
  ownerId: participantIdSchema,
  currency: z.enum(CURRENCIES),
  state: z.enum(AGREEMENT_STATES),
  currentVersionId: participantIdSchema.nullable(),
  revision: z.string().regex(/^\d+$/),
  returnedAt: z.string().nullable(),
  inspectionDeadline: z.string().nullable(),
});
const transitionSchema = z.object({
  agreement: summarySchema,
  operationId: participantIdSchema,
});
const startOutput = transitionSchema.extend({
  attemptId: participantIdSchema,
  dueAt: z.string(),
});
const completeOutput = transitionSchema.extend({
  attemptId: participantIdSchema,
  attemptState: z.enum(["succeeded", "failed", "cancelled"]),
});
const batchOutput = z.object({
  jobRunId: participantIdSchema,
  processedCount: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
const errorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.enum([
      "not_authenticated",
      "not_authorized",
      "validation_failed",
      "not_found",
      "stale_version",
      "stale_revision",
      "invalid_state",
      "acceptances_required",
      "idempotency_conflict",
      "already_processed",
      "temporarily_unavailable",
    ]),
    message: z.string(),
    retryable: z.boolean(),
  }),
});
function failure(code: "validation_failed" | "temporarily_unavailable") {
  return {
    ok: false as const,
    error: {
      code,
      message:
        code === "validation_failed"
          ? "Invalid funding request."
          : "Funding is temporarily unavailable.",
      retryable: code === "temporarily_unavailable",
    },
  };
}
async function invoke<T>(
  rpc: FundingRpc,
  name: Parameters<FundingRpc>[0],
  input: unknown,
  output: z.ZodType<T>,
): Promise<OperationResult<T>> {
  try {
    const response = await rpc(name, { p_input: input });
    if (response.error) return failure("temporarily_unavailable");
    const result = z
      .union([
        z.object({ ok: z.literal(true), replayed: z.boolean(), data: output }),
        errorSchema,
      ])
      .safeParse(response.data);
    return result.success ? result.data : failure("temporarily_unavailable");
  } catch {
    return failure("temporarily_unavailable");
  }
}

/** Server-only adapter. Separate caller-scoped and trusted worker transports.
 * No endpoint is exported; never pass the worker capability to a user action.
 */
export class SimulatedDepositProvider implements DepositProvider {
  readonly kind = "simulated" as const;
  constructor(
    private readonly userRpc: FundingRpc,
    private readonly workerRpc: FundingRpc,
  ) {}

  async start(
    input: OperationInput<"startContribution">,
  ): Promise<OperationResult<OperationOutput<"startContribution">>> {
    const parsed = startSchema.safeParse(input);
    return parsed.success
      ? invoke(this.userRpc, "start_contribution", parsed.data, startOutput)
      : failure("validation_failed");
  }
  async cancel(
    input: OperationInput<"cancelAgreement">,
  ): Promise<OperationResult<OperationOutput<"cancelAgreement">>> {
    const parsed = mutationInputSchema.safeParse(input);
    return parsed.success
      ? invoke(this.userRpc, "cancel_agreement", parsed.data, transitionSchema)
      : failure("validation_failed");
  }
  async complete(
    input: OperationInput<"completeSimulatedContribution">,
  ): Promise<
    OperationResult<OperationOutput<"completeSimulatedContribution">>
  > {
    const parsed = completeSchema.safeParse(input);
    return parsed.success
      ? invoke(
          this.workerRpc,
          "complete_simulated_contribution",
          parsed.data,
          completeOutput,
        )
      : failure("validation_failed");
  }
  async processDue(
    input: OperationInput<"processDueContributions">,
  ): Promise<OperationResult<OperationOutput<"processDueContributions">>> {
    const parsed = batchSchema.safeParse(input);
    return parsed.success
      ? invoke(
          this.workerRpc,
          "process_due_contributions",
          parsed.data,
          batchOutput,
        )
      : failure("validation_failed");
  }
}
