import type { EvidenceFile, EvidencePhase } from "../contracts";

export const MAX_EVIDENCE_BYTES = 10_000_000;
export const MAX_EVIDENCE_FILES = 12;

export function cleanEvidenceText(value: string, max: number): string {
  return value
    .split("")
    .map((character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
        ? " "
        : character,
    )
    .join("")
    .trim()
    .slice(0, max);
}

export async function validateEvidenceFile(file: File, phase: EvidencePhase) {
  if (file.size === 0 || file.size > MAX_EVIDENCE_BYTES) {
    throw new Error("Choose a non-empty file of 10 MB or less.");
  }
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  const signatures: Record<EvidenceFile["mimeType"], boolean> = {
    "image/jpeg": bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    "image/png": [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    ),
    "image/webp": ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP",
    "application/pdf": ascii(0, 5) === "%PDF-",
  };
  const mime = file.type as EvidenceFile["mimeType"];
  if (!Object.hasOwn(signatures, mime) || !signatures[mime]) {
    throw new Error(
      "File contents must match a JPEG, PNG, WebP, or PDF file type.",
    );
  }
  if (mime === "application/pdf" && phase !== "dispute") {
    throw new Error(
      "PDF documents are allowed only for dispute evidence. Upload a photo here; attach the contract during agreement setup.",
    );
  }
  return mime;
}

export async function describeEvidence(
  input: {
    agreementId: string;
    phase: EvidencePhase;
    actorId: string;
    file: File;
    caption: string;
  },
  storage: EvidenceFile["storage"],
): Promise<EvidenceFile> {
  const mimeType = await validateEvidenceFile(input.file, input.phase);
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.randomUUID) {
    throw new Error(
      "Secure file processing requires a supported browser on HTTPS or localhost.",
    );
  }
  if (!input.agreementId || !input.actorId)
    throw new Error("An agreement and signed-in participant are required.");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await input.file.arrayBuffer(),
  );
  const id = crypto.randomUUID();
  return {
    id,
    agreementId: input.agreementId,
    phase: input.phase,
    fileName:
      cleanEvidenceText(input.file.name.replace(/[\\/]/g, "_"), 160) ||
      "Evidence",
    mimeType,
    sizeBytes: input.file.size,
    sha256: Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
    createdAt: new Date().toISOString(),
    uploaderId: input.actorId,
    caption: cleanEvidenceText(input.caption, 500),
    storage,
    objectPath: `evidence/${id}/${crypto.randomUUID()}`,
    submittedAt: null,
  };
}
