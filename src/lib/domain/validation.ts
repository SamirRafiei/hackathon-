import { z } from "zod";
import { allocateContributions, AllocationError } from "./allocation";
import { CURRENCIES, PACT_POLICY } from "./model";

export const participantIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform((value) => value.toLowerCase());
export const currencySchema = z.enum(CURRENCIES);
export const minorUnitsSchema = z
  .number()
  .int()
  .min(0)
  .max(PACT_POLICY.maxDepositMinor);
export const basisPointsSchema = z
  .number()
  .int()
  .min(1)
  .max(PACT_POLICY.basisPointTotal);
export const mutationInputSchema = z
  .object({
    agreementId: participantIdSchema,
    expectedRevision: z
      .string()
      .max(19)
      .regex(/^(0|[1-9][0-9]*)$/)
      .refine(
        (value) =>
          value.length <= 19 &&
          /^(0|[1-9][0-9]*)$/.test(value) &&
          BigInt(value) <= BigInt("9223372036854775807"),
        "Revision exceeds PostgreSQL bigint",
      ),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();

export const agreementTermsSchema = z
  .object({
    currency: currencySchema,
    depositMinor: minorUnitsSchema.min(1),
    rentalFeeMinor: minorUnitsSchema.optional(),
    itemName: z.string().trim().min(1).max(200),
    itemDescription: z.string().max(10000),
    itemIdentifier: z.string().max(1000).optional(),
    accessories: z.array(z.string().min(1).max(1000)).max(100),
    terms: z.string().trim().min(1).max(20000),
    conditionRequirements: z.record(z.string(), z.json()),
    startsAt: z.iso.datetime(),
    dueAt: z.iso.datetime(),
    borrowers: z
      .array(
        z
          .object({
            participantId: participantIdSchema,
            email: z.string().trim().toLowerCase().pipe(z.email()),
            shareBps: basisPointsSchema,
          })
          .strict(),
      )
      .min(1)
      .max(PACT_POLICY.maxBorrowers),
    policyVersion: z.literal(PACT_POLICY.version),
    inspectionHours: z.literal(24),
    anyBorrowerMayExchange: z.literal(true),
  })
  .strict()
  .superRefine((terms, ctx) => {
    if (Date.parse(terms.dueAt) <= Date.parse(terms.startsAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "Return must follow start",
      });
    }
    if (
      new Set(terms.borrowers.map((borrower) => borrower.email)).size !==
      terms.borrowers.length
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["borrowers"],
        message: "Borrower emails must be unique",
      });
    }
    try {
      allocateContributions(
        { currency: terms.currency, amountMinor: terms.depositMinor },
        terms.borrowers,
      );
    } catch (error) {
      if (!(error instanceof AllocationError)) throw error;
      ctx.addIssue({
        code: "custom",
        path: ["borrowers"],
        message: error.code,
      });
    }
  });

export const evidenceMetadataSchema = z
  .object({
    phase: z.enum(["item", "collection", "return", "dispute"]),
    mimeType: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]),
    sizeBytes: z.number().int().min(1).max(PACT_POLICY.maxEvidenceBytes),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()
  .refine(
    (value) =>
      value.mimeType !== "application/pdf" || value.phase === "dispute",
    {
      message: "PDF documents are limited to dispute evidence",
    },
  );
