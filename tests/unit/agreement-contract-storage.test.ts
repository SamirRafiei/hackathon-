// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BrowserContractStorage,
  type ContractBlobRepository,
} from "@/features/agreements/contracts/storage";
import { contractSchema } from "@/features/agreements/contracts/model";
import { DEMO_AGREEMENT_PRESETS } from "@/features/demo/agreement-presets";
import {
  createDemoAgreement,
  createDemoSetupSnapshot,
  demoSnapshotSchema,
  type DemoAgreementInput,
} from "@/features/demo/model";
import { demoActors } from "@/lib/auth/identity-provider";

const pdf = () =>
  new File(["%PDF-1.7\nDemo test fixture\n%%EOF"], "lease.pdf", {
    type: "application/pdf",
  });
type Stored = Parameters<ContractBlobRepository["put"]>[0];
const records = new Map<string, Stored>();
const repository: ContractBlobRepository = {
  put: async (record) => {
    records.set(record.id, record);
  },
  get: async (id) => records.get(id),
};
beforeEach(() => records.clear());
describe("agreement contract attachments", () => {
  it("saves PDF bytes and keeps a version-bound reference after agreement reload", async () => {
    const file = pdf();
    const contract = await new BrowserContractStorage(repository).upload(file);
    expect(contractSchema.parse(contract)).toEqual(contract);
    expect(await records.get(contract.id)?.blob.text()).toBe(await file.text());
    const snapshot = createDemoAgreement(demoActors.landlord, {
      ...DEMO_AGREEMENT_PRESETS.APARTMENT,
      contract,
    });
    const reloaded = demoSnapshotSchema.parse(
      JSON.parse(JSON.stringify(snapshot)),
    );
    expect(reloaded.agreement.contract).toEqual(contract);
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:contract");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const resource = await new BrowserContractStorage(repository).getUrl(
      contract,
    );
    expect(createUrl).toHaveBeenCalledWith(records.get(contract.id)?.blob);
    resource.release();
    expect(revoke).toHaveBeenCalledWith("blob:contract");
    vi.restoreAllMocks();
  });
  it.each([
    new File(["not a PDF"], "lease.pdf", { type: "application/pdf" }),
    new File(["%PDF-1.7 truncated"], "lease.pdf", { type: "application/pdf" }),
    new File(["%PDF-1.7\n%%EOF"], "lease.png", { type: "image/png" }),
    new File([], "empty.pdf", { type: "application/pdf" }),
    new File([new Uint8Array(10_000_001)], "large.pdf", {
      type: "application/pdf",
    }),
  ])("rejects invalid PDF $name without saving it", async (file) => {
    await expect(
      new BrowserContractStorage(repository).upload(file),
    ).rejects.toThrow();
    expect(records.size).toBe(0);
  });
  it("surfaces write failure and detects missing or altered saved bytes", async () => {
    const failing = new BrowserContractStorage({
      ...repository,
      put: async () => {
        throw new Error("Storage full");
      },
    });
    await expect(failing.upload(pdf())).rejects.toThrow("Storage full");
    const storage = new BrowserContractStorage(repository);
    const contract = await storage.upload(pdf());
    records.set(contract.id, { id: contract.id, blob: new Blob(["changed"]) });
    await expect(storage.getUrl(contract)).rejects.toThrow(
      "could not be verified",
    );
    records.clear();
    await expect(storage.getUrl(contract)).rejects.toThrow("missing");
  });
  it("requires a contract for new agreements and rejects a mismatched demo PDF", () => {
    const { contract: _, ...missing } = DEMO_AGREEMENT_PRESETS.APARTMENT;
    expect(() =>
      createDemoAgreement(demoActors.landlord, missing as DemoAgreementInput),
    ).toThrow("Attach a contract PDF");
    expect(() =>
      createDemoAgreement(demoActors.landlord, {
        ...DEMO_AGREEMENT_PRESETS.APARTMENT,
        contract: DEMO_AGREEMENT_PRESETS.EQUIPMENT.contract,
      }),
    ).toThrow("matching the rental type");
    expect(
      demoSnapshotSchema.parse(createDemoSetupSnapshot()).setupPending,
    ).toBe(true);
  });
});
