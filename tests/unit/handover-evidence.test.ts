import { File as NodeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  BrowserDemoEvidenceStorage,
  IndexedDbEvidenceRepository,
  type EvidenceBlobRepository,
  type StoredEvidence,
  SupabaseEvidenceStorage,
  type AuthorizedEvidenceGateway,
} from "@/features/handover/evidence/storage";
import {
  cleanEvidenceText,
  validateEvidenceFile,
} from "@/features/handover/evidence/validation";

function image(name = "condition.png", type = "image/png") {
  return new NodeFile(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])],
    name,
    { type },
  ) as unknown as File;
}
class MemoryRepository implements EvidenceBlobRepository {
  rows = new Map<string, StoredEvidence>();
  async put(record: StoredEvidence) {
    this.rows.set(record.metadata.id, record);
  }
  async get(id: string) {
    return this.rows.get(id);
  }
  async mutate(
    id: string,
    update: (record: StoredEvidence) => StoredEvidence | undefined,
  ) {
    const record = this.rows.get(id);
    if (!record) throw new Error("Missing evidence");
    const next = update(record);
    if (next) this.rows.set(id, next);
    else this.rows.delete(id);
    return next;
  }
}
const input = () => ({
  agreementId: "agreement",
  phase: "baseline" as const,
  actorId: "renter",
  file: image(),
  caption: "Condition",
});

describe("evidence validation", () => {
  it("checks byte signatures instead of trusting extensions and MIME labels", async () => {
    await expect(validateEvidenceFile(image(), "baseline")).resolves.toBe(
      "image/png",
    );
    await expect(
      validateEvidenceFile(image("fake.jpg", "image/jpeg"), "baseline"),
    ).rejects.toThrow("contents must match");
    const fake = new NodeFile(["not a photo"], "fake.png", {
      type: "image/png",
    }) as unknown as File;
    await expect(validateEvidenceFile(fake, "baseline")).rejects.toThrow(
      "contents must match",
    );
  });
  it("restricts documents to dispute evidence and rejects empty and large files", async () => {
    const pdf = new NodeFile(["%PDF-1.7"], "receipt.pdf", {
      type: "application/pdf",
    }) as unknown as File;
    await expect(validateEvidenceFile(pdf, "dispute")).resolves.toBe(
      "application/pdf",
    );
    await expect(validateEvidenceFile(pdf, "return")).rejects.toThrow(
      "only for dispute",
    );
    await expect(
      validateEvidenceFile(
        new NodeFile([], "empty.png", { type: "image/png" }) as unknown as File,
        "baseline",
      ),
    ).rejects.toThrow("non-empty");
    await expect(
      validateEvidenceFile({ size: 10_000_001 } as File, "baseline"),
    ).rejects.toThrow("10 MB");
  });
  it("cleans unsafe control characters and bounds text", () => {
    expect(cleanEvidenceText(" hi\u0000there ", 8)).toBe("hi there");
  });
});

describe("evidence adapters", () => {
  it("fails visibly when durable browser storage is unsupported", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(
      new IndexedDbEvidenceRepository().get("missing"),
    ).rejects.toThrow("Enable IndexedDB");
    vi.unstubAllGlobals();
  });
  it("stores actual bytes, hashes content, uses random paths, and preserves submitted evidence against stale deletes", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const repository = new MemoryRepository();
    const storage = new BrowserDemoEvidenceStorage(repository);
    const draft = await storage.upload(input());
    expect(draft.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.rows.get(draft.id)?.blob).toBeInstanceOf(NodeFile);
    expect(draft.objectPath).not.toContain(draft.fileName);
    const second = await storage.upload(input());
    expect(second.objectPath).not.toBe(draft.objectPath);
    const submitted = await storage.finalize(draft);
    expect(submitted.submittedAt).toBeTruthy();
    await expect(storage.remove(draft)).rejects.toThrow("cannot be deleted");
    expect((await storage.finalize(draft)).submittedAt).toBe(
      submitted.submittedAt,
    );
    await storage.remove(second);
    expect(repository.rows.has(second.id)).toBe(false);
    vi.unstubAllGlobals();
  });
  it("does not report successful uploads when the authorized gateway fails", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const gateway = {
      prepare: vi.fn().mockRejectedValue(new Error("Not authorized")),
      uploadPrivateObject: vi.fn(),
      finalizeChecked: vi.fn(),
      signedDownload: vi.fn(),
      removeOwnedDraft: vi.fn(),
    } satisfies AuthorizedEvidenceGateway;
    await expect(
      new SupabaseEvidenceStorage(gateway).upload(input()),
    ).rejects.toThrow("Not authorized");
    expect(gateway.uploadPrivateObject).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
