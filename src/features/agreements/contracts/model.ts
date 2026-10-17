import { z } from "zod";
export const MAX_CONTRACT_BYTES = 10_000_000;
export const contractSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("demo-preset"),
    assetType: z.enum(["APARTMENT", "EQUIPMENT"]),
  }),
  z.object({
    source: z.literal("browser-demo"),
    id: z.string().uuid(),
    fileName: z.string().min(1).max(160),
    sizeBytes: z.number().int().positive().max(MAX_CONTRACT_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
]);
export type AgreementContract = z.infer<typeof contractSchema>;
export function contractName(contract: AgreementContract) {
  return contract.source === "demo-preset"
    ? `demo-${contract.assetType.toLowerCase()}-contract.pdf`
    : contract.fileName;
}
export function presetContractUrl(contract: AgreementContract) {
  return contract.source === "demo-preset"
    ? `/demo-contracts/${contractName(contract)}`
    : undefined;
}
