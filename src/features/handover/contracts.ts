/** Shared handover feature contracts. UI actors are not server authentication. */
export type AssetType = "APARTMENT" | "EQUIPMENT";
export type EvidencePhase = "baseline" | "return" | "arrival" | "dispute";
export type HandoverActor = {
  id: string;
  displayName: string;
  role: "owner" | "renter";
};
export type EvidenceFile = {
  id: string;
  agreementId: string;
  phase: EvidencePhase;
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  uploaderId: string;
  caption: string;
  storage: "browser-demo" | "supabase";
  objectPath: string;
  submittedAt: string | null;
};
export interface EvidenceStorage {
  readonly mode: "browser-demo" | "supabase";
  upload(input: {
    agreementId: string;
    phase: EvidencePhase;
    actorId: string;
    file: File;
    caption: string;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  }): Promise<EvidenceFile>;
  getUrl(file: EvidenceFile): Promise<{ url: string; release?: () => void }>;
  finalize(file: EvidenceFile): Promise<EvidenceFile>;
  remove(file: EvidenceFile): Promise<void>;
}
export type ChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
  note: string;
};
export type BaselineRecord = {
  id: string;
  agreementId: string;
  termsVersion: number;
  version: number;
  assetType: AssetType;
  identifier: string;
  notes: string;
  checklist: ChecklistItem[];
  evidence: EvidenceFile[];
  publishedAt: string;
  acknowledgedBy: Record<string, string>;
};
export type ReturnRecord = {
  id: string;
  agreementId: string;
  baselineId: string;
  baselineVersion: number;
  submittedBy: string;
  submittedAt: string;
  inspectionDeadline: string;
  location: string;
  notes: string;
  checklist: ChecklistItem[];
  evidence: EvidenceFile[];
};
export type ListingSnapshot = {
  title: string;
  address: string;
  description: string;
  promisedFeatures: string[];
};
export type ArrivalRecord = {
  id: string;
  agreementId: string;
  submittedBy: string;
  submittedAt: string;
  accessConfirmed: boolean;
  available: boolean;
  matchesListing: boolean;
  notes: string;
  evidence: EvidenceFile[];
};
