"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  EvidenceFile,
  EvidencePhase,
  EvidenceStorage,
  HandoverActor,
} from "../contracts";
import { MAX_EVIDENCE_FILES } from "./validation";
import { EvidencePreview } from "./evidence-preview";

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The file action failed. Please retry.";
}

export type EvidenceUploaderProps = {
  agreementId: string;
  phase: EvidencePhase;
  actor: HandoverActor;
  storage: EvidenceStorage;
  files: EvidenceFile[];
  onChange: (files: EvidenceFile[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};
export function EvidenceUploader({
  agreementId,
  phase,
  actor,
  storage,
  files,
  onChange,
  disabled = false,
  onBusyChange,
}: EvidenceUploaderProps) {
  const id = useId();
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<File[]>([]);
  const lock = useRef(false);
  const currentFiles = useRef(files);
  currentFiles.current = files;
  const accept =
    phase === "dispute"
      ? "image/jpeg,image/png,image/webp,application/pdf"
      : "image/jpeg,image/png,image/webp";
  async function upload(selected: File[]) {
    if (lock.current || disabled || !selected.length) return;
    if (currentFiles.current.length + selected.length > MAX_EVIDENCE_FILES) {
      setError(`Keep this record to ${MAX_EVIDENCE_FILES} files or fewer.`);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setRetry([]);
    const next = [...currentFiles.current];
    for (let index = 0; index < selected.length; index++) {
      setProgress(0);
      try {
        const file = await storage.upload({
          agreementId,
          phase,
          actorId: actor.id,
          file: selected[index],
          caption,
          onProgress: setProgress,
        });
        next.push(file);
        currentFiles.current = [...next];
        onChange([...next]);
      } catch (reason) {
        setError(message(reason));
        setRetry(selected.slice(index));
        break;
      }
    }
    setBusy(false);
    lock.current = false;
  }
  async function remove(file: EvidenceFile) {
    if (
      disabled ||
      lock.current ||
      file.uploaderId !== actor.id ||
      file.submittedAt
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await storage.remove(file);
      onChange(
        currentFiles.current.filter((candidate) => candidate.id !== file.id),
      );
    } catch (reason) {
      setError(message(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      aria-label={`${phase} evidence`}
      className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <div>
        <h3 className="font-semibold text-slate-900">Condition evidence</h3>
        <p className="mt-1 text-sm text-slate-600">
          JPEG, PNG or WebP{phase === "dispute" ? ", or PDF documents" : ""}. Up
          to 10 MB each, {MAX_EVIDENCE_FILES} files per record.
        </p>
        {storage.mode === "browser-demo" ? (
          <p className="mt-1 text-xs text-amber-800">
            Browser demo: files stay on this browser and are not shared with
            other devices. Demo identities are not authentication. Use sample
            photos; do not upload real private documents.
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor={`${id}-caption`} className="block text-sm font-medium">
          Caption for new files
        </label>
        <input
          id={`${id}-caption`}
          value={caption}
          maxLength={500}
          onChange={(event) => setCaption(event.target.value)}
          disabled={disabled || busy}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2"
          placeholder="Describe the condition or identifying details"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm font-medium">
          Choose files
          <input
            aria-label="Choose evidence files"
            type="file"
            accept={accept}
            multiple
            disabled={disabled || busy || files.length >= MAX_EVIDENCE_FILES}
            className="mt-1 block max-w-full text-sm"
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              event.target.value = "";
              void upload(selected);
            }}
          />
        </label>
        <label className="text-sm font-medium">
          Take a photo
          <input
            aria-label="Take condition photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={disabled || busy || files.length >= MAX_EVIDENCE_FILES}
            className="mt-1 block max-w-full text-sm"
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              event.target.value = "";
              void upload(selected);
            }}
          />
        </label>
      </div>
      {busy ? (
        <div role="status" className="text-sm">
          <p>Saving evidence… {progress}%</p>
          <progress
            aria-label="Evidence upload progress"
            value={progress}
            max={100}
            className="w-full"
          />
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
          {retry.length ? (
            <button
              type="button"
              disabled={disabled || busy}
              className="ml-3 font-semibold underline"
              onClick={() => void upload(retry)}
            >
              Retry upload
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {files.map((file) => (
          <div key={file.id} className="space-y-2">
            <EvidencePreview file={file} storage={storage} />
            {file.uploaderId === actor.id && !file.submittedAt ? (
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => void remove(file)}
                className="text-sm font-medium text-rose-700 underline disabled:opacity-50"
              >
                Remove {file.fileName}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
