import { MAX_CONTRACT_BYTES, type AgreementContract } from "./model";
type UploadedContract = Extract<AgreementContract, { source: "browser-demo" }>;
type StoredContract = { id: string; blob: Blob };
export interface ContractBlobRepository {
  put(record: StoredContract): Promise<void>;
  get(id: string): Promise<StoredContract | undefined>;
}
class IndexedDbContractRepository implements ContractBlobRepository {
  private database?: Promise<IDBDatabase>;
  private open() {
    this.database ??= new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("Enable browser storage to attach a contract PDF."));
        return;
      }
      const request = indexedDB.open("pact-demo-contracts", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("files", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          new Error(
            "Could not open contract storage. Check browser storage settings and retry.",
          ),
        );
      request.onblocked = () =>
        reject(
          new Error("Close older Pact tabs and retry attaching the contract."),
        );
    });
    return this.database;
  }
  async put(record: StoredContract) {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").add(record);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(
          new Error(
            "The contract could not be saved. Check available browser storage and retry.",
          ),
        );
    });
  }
  async get(id: string) {
    const db = await this.open();
    return new Promise<StoredContract | undefined>((resolve, reject) => {
      const request = db
        .transaction("files", "readonly")
        .objectStore("files")
        .get(id);
      request.onsuccess = () =>
        resolve(request.result as StoredContract | undefined);
      request.onerror = () =>
        reject(new Error("The contract could not be read from this browser."));
    });
  }
}
async function digest(bytes: ArrayBuffer) {
  if (!globalThis.crypto?.subtle)
    throw new Error("Contract uploads require HTTPS or localhost.");
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
/** Actual PDF bytes stay in this browser. Metadata is attached to the accepted agreement version. */
export class BrowserContractStorage {
  constructor(
    private readonly repository: ContractBlobRepository = new IndexedDbContractRepository(),
  ) {}
  async upload(file: File): Promise<UploadedContract> {
    if (
      !/\.pdf$/i.test(file.name) ||
      (file.type && file.type !== "application/pdf")
    )
      throw new Error("Attach a PDF contract.");
    if (!file.size || file.size > MAX_CONTRACT_BYTES)
      throw new Error("Choose a non-empty contract PDF of 10 MB or less.");
    const bytes = await file.arrayBuffer();
    const content = new TextDecoder("latin1").decode(bytes);
    if (!content.startsWith("%PDF-") || !content.slice(-1024).includes("%%EOF"))
      throw new Error(
        "This file does not contain a complete PDF. Export the contract as PDF and retry.",
      );
    const contract: UploadedContract = {
      source: "browser-demo",
      id: crypto.randomUUID(),
      fileName: Array.from(file.name, (char) =>
        char.charCodeAt(0) < 32 ||
        char.charCodeAt(0) === 127 ||
        char === "/" ||
        char === "\\"
          ? "_"
          : char,
      )
        .join("")
        .slice(0, 160),
      sizeBytes: file.size,
      sha256: await digest(bytes),
    };
    await this.repository.put({
      id: contract.id,
      blob: new Blob([bytes], { type: "application/pdf" }),
    });
    return contract;
  }
  async getUrl(contract: UploadedContract) {
    const stored = await this.repository.get(contract.id);
    if (!stored)
      throw new Error(
        "This contract is missing from this browser. Contracts do not sync between devices; recreate the demo agreement with the original PDF.",
      );
    if (
      stored.blob.size !== contract.sizeBytes ||
      (await digest(await stored.blob.arrayBuffer())) !== contract.sha256
    )
      throw new Error(
        "The stored contract could not be verified. Recreate the demo agreement with the original PDF.",
      );
    const url = URL.createObjectURL(stored.blob);
    return { url, release: () => URL.revokeObjectURL(url) };
  }
}
