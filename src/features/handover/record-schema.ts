import { z } from "zod";

export const evidenceFileSchema = z.object({
  id: z.string().min(1),
  agreementId: z.string().min(1),
  phase: z.enum(["baseline", "return", "arrival", "dispute"]),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ]),
  sizeBytes: z.number().int().positive().max(10_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  createdAt: z.string().datetime(),
  uploaderId: z.string().min(1),
  caption: z.string().max(2000),
  storage: z.enum(["browser-demo", "supabase"]),
  objectPath: z.string().min(1),
  submittedAt: z.string().datetime().nullable(),
});
const checklistSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1).max(240),
      checked: z.boolean(),
      note: z.string().max(2000),
    }),
  )
  .min(1)
  .max(50);
const filesSchema = z.array(evidenceFileSchema).max(12);
export const baselineRecordSchema = z.object({
  id: z.string().min(1),
  agreementId: z.string().min(1),
  termsVersion: z.number().int().positive(),
  version: z.number().int().positive(),
  assetType: z.enum(["APARTMENT", "EQUIPMENT"]),
  identifier: z.string().min(1).max(240),
  notes: z.string().max(5000),
  checklist: checklistSchema,
  evidence: filesSchema,
  publishedAt: z.string().datetime(),
  acknowledgedBy: z.record(z.string(), z.string().datetime()),
});
export const returnRecordSchema = z.object({
  id: z.string().min(1),
  agreementId: z.string().min(1),
  baselineId: z.string().min(1),
  baselineVersion: z.number().int().positive(),
  submittedBy: z.string().min(1),
  submittedAt: z.string().datetime(),
  inspectionDeadline: z.string().datetime(),
  location: z.string().min(1).max(300),
  notes: z.string().max(5000),
  checklist: checklistSchema,
  evidence: filesSchema,
});
export const arrivalRecordSchema = z.object({
  id: z.string().min(1),
  agreementId: z.string().min(1),
  submittedBy: z.string().min(1),
  submittedAt: z.string().datetime(),
  accessConfirmed: z.boolean(),
  available: z.boolean(),
  matchesListing: z.boolean(),
  notes: z.string().max(5000),
  evidence: filesSchema,
});
export const handoverStateSchema = z.object({
  baseline: baselineRecordSchema.nullable(),
  returnRecord: returnRecordSchema.nullable(),
  arrivalRecord: arrivalRecordSchema.nullable(),
});
export type HandoverState = z.infer<typeof handoverStateSchema>;
export function emptyHandoverState(): HandoverState {
  return { baseline: null, returnRecord: null, arrivalRecord: null };
}
