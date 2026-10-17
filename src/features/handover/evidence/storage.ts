import type { EvidenceFile, EvidenceStorage } from "../contracts";
import { describeEvidence } from "./validation";

export type StoredEvidence = { metadata: EvidenceFile; blob: Blob };
export interface EvidenceBlobRepository {
  put(record: StoredEvidence): Promise<void>;
  get(id: string): Promise<StoredEvidence | undefined>;
  mutate(
    id: string,
    update: (record: StoredEvidence) => StoredEvidence | undefined,
  ): Promise<StoredEvidence | undefined>;
}

/** IndexedDB keeps actual Blobs across reloads; metadata-only localStorage is not evidence storage. */
export class IndexedDbEvidenceRepository implements EvidenceBlobRepository {
  private database?: Promise<IDBDatabase>;
  private open() {
    if (!this.database) {
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
          reject(
            new Error(
              "This browser cannot store demo evidence. Enable IndexedDB or use a supported browser.",
            ),
          );
          return;
        }
        const request = indexedDB.open("pact-private-demo-evidence", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("files", { keyPath: "metadata.id" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(
            new Error(
              "Unable to open browser evidence storage. Check browser privacy and storage settings.",
            ),
          );
        request.onblocked = () =>
          reject(
            new Error(
              "Evidence storage is blocked by another tab. Close older Pact tabs and retry.",
            ),
          );
      });
    }
    return this.database;
  }
  async put(record: StoredEvidence) {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").add(record);
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          new Error(
            "Evidence could not be saved. Check available browser storage and retry.",
          ),
        );
      tx.onerror = () =>
        reject(
          new Error(
            "Evidence storage failed. Check available browser storage.",
          ),
        );
    });
  }
  async get(id: string) {
    const db = await this.open();
    return new Promise<StoredEvidence | undefined>((resolve, reject) => {
      const request = db
        .transaction("files", "readonly")
        .objectStore("files")
        .get(id);
      request.onsuccess = () =>
        resolve(request.result as StoredEvidence | undefined);
      request.onerror = () =>
        reject(new Error("Evidence could not be loaded from this browser."));
    });
  }
  async mutate(
    id: string,
    update: (record: StoredEvidence) => StoredEvidence | undefined,
  ) {
    const db = await this.open();
    return new Promise<StoredEvidence | undefined>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      const request = store.get(id);
      let result: StoredEvidence | undefined;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          if (!request.result)
            throw new Error(
              "Evidence is missing from this browser. Upload the file again.",
            );
          result = update(request.result as StoredEvidence);
          if (result) store.put(result);
          else store.delete(id);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(
          failure ?? new Error("Evidence update failed. Retry the action."),
        );
      tx.onerror = () =>
        reject(failure ?? new Error("Evidence storage update failed."));
    });
  }
}

export class BrowserDemoEvidenceStorage implements EvidenceStorage {
  readonly mode = "browser-demo" as const;
  constructor(
    private readonly repository: EvidenceBlobRepository = new IndexedDbEvidenceRepository(),
  ) {}
  async upload(input: Parameters<EvidenceStorage["upload"]>[0]) {
    input.signal?.throwIfAborted();
    input.onProgress?.(0);
    const metadata = await describeEvidence(input, this.mode);
    input.signal?.throwIfAborted();
    input.onProgress?.(50);
    await this.repository.put({ metadata, blob: input.file });
    input.onProgress?.(100);
    return metadata;
  }
  async getUrl(file: EvidenceFile) {
    const record = await this.repository.get(file.id);
    if (!record)
      throw new Error(
        "This file is unavailable on this browser. Demo uploads do not sync between devices.",
      );
    const url = URL.createObjectURL(record.blob);
    return { url, release: () => URL.revokeObjectURL(url) };
  }
  async finalize(file: EvidenceFile) {
    const result = await this.repository.mutate(file.id, (record) => ({
      ...record,
      metadata: {
        ...record.metadata,
        submittedAt: record.metadata.submittedAt ?? new Date().toISOString(),
      },
    }));
    if (!result) throw new Error("Evidence could not be finalized.");
    return result.metadata;
  }
  async remove(file: EvidenceFile) {
    await this.repository.mutate(file.id, (record) => {
      if (record.metadata.submittedAt)
        throw new Error(
          "Submitted evidence is permanent and cannot be deleted.",
        );
      return undefined;
    });
  }
}

/** Every gateway method must authenticate and authorize on the server; actorId is never authority. */
export interface AuthorizedEvidenceGateway {
  prepare(metadata: EvidenceFile): Promise<EvidenceFile>;
  uploadPrivateObject(
    file: EvidenceFile,
    blob: Blob,
    options: { onProgress?: (percent: number) => void; signal?: AbortSignal },
  ): Promise<void>;
  finalizeChecked(fileId: string): Promise<EvidenceFile>;
  signedDownload(fileId: string): Promise<{ url: string }>;
  removeOwnedDraft(fileId: string): Promise<void>;
}
export class SupabaseEvidenceStorage implements EvidenceStorage {
  readonly mode = "supabase" as const;
  constructor(private readonly gateway: AuthorizedEvidenceGateway) {}
  async upload(input: Parameters<EvidenceStorage["upload"]>[0]) {
    input.signal?.throwIfAborted();
    const metadata = await describeEvidence(input, this.mode);
    const prepared = await this.gateway.prepare(metadata);
    await this.gateway.uploadPrivateObject(prepared, input.file, {
      onProgress: input.onProgress,
      signal: input.signal,
    });
    return prepared;
  }
  getUrl(file: EvidenceFile) {
    return this.gateway.signedDownload(file.id);
  }
  finalize(file: EvidenceFile) {
    return this.gateway.finalizeChecked(file.id);
  }
  remove(file: EvidenceFile) {
    return this.gateway.removeOwnedDraft(file.id);
  }
}
