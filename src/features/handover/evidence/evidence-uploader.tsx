"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Camera,
  Check,
  ImagePlus,
  LoaderCircle,
  Trash2,
  Upload,
} from "lucide-react";
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
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [activeFile, setActiveFile] = useState("");
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
  const atLimit = files.length >= MAX_EVIDENCE_FILES;
  const cannotAdd = disabled || busy || atLimit;
  const documents = phase === "dispute";
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
      setActiveFile(selected[index].name);
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
    setActiveFile("");
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
      className="min-w-0 space-y-4 rounded-2xl border border-border bg-white p-4 sm:p-5"
    >
      <div>
        <h3 className="font-semibold text-foreground">
          {documents ? "Add supporting files" : "Add condition photos"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {documents
            ? "Choose photos or documents"
            : "Choose photos from your device"}
          , then review them below. They are submitted when you publish or
          submit this record.
        </p>
      </div>
      <div className="rounded-xl border-2 border-dashed border-border bg-muted/40 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-foreground">
            <ImagePlus aria-hidden="true" size={21} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {files.length ? "Add more evidence" : "Start with a clear photo"}
            </p>
            <p
              id={`${id}-limits`}
              className="mt-1 text-xs leading-relaxed text-muted-foreground"
            >
              JPEG, PNG or WebP
              {documents ? ", or PDF documents" : ""}. Up to 10 MB each ·{" "}
              {MAX_EVIDENCE_FILES} files per record.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled={cannotAdd}
            onClick={() => fileInput.current?.click()}
            aria-controls={`${id}-files`}
            aria-describedby={`${id}-limits`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload aria-hidden="true" size={17} />
            {documents ? "Upload files" : "Upload photos"}
          </button>
          <button
            type="button"
            disabled={cannotAdd}
            onClick={() => cameraInput.current?.click()}
            aria-controls={`${id}-camera`}
            aria-describedby={`${id}-camera-help`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Camera aria-hidden="true" size={17} /> Take photo
          </button>
        </div>
        <p
          id={`${id}-camera-help`}
          className="mt-3 text-xs text-muted-foreground"
        >
          On supported phones, “Take photo” opens your camera. On a computer,
          choose an existing photo.
        </p>
        {atLimit && (
          <p role="status" className="mt-2 text-sm font-medium">
            File limit reached. Remove a draft to add another file.
          </p>
        )}
        <input
          ref={fileInput}
          id={`${id}-files`}
          aria-label="Choose evidence files"
          type="file"
          accept={accept}
          multiple
          hidden
          disabled={cannotAdd}
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            event.target.value = "";
            void upload(selected);
          }}
        />

        <input
          ref={cameraInput}
          id={`${id}-camera`}
          aria-label="Take condition photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          hidden
          disabled={cannotAdd}
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            event.target.value = "";
            void upload(selected);
          }}
        />
      </div>
      <div>
        <label htmlFor={`${id}-caption`} className="block text-sm font-medium">
          Caption for new files{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
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
        <p className="mt-1 text-xs text-muted-foreground">
          Applies to the next files you add.
        </p>
      </div>
      {busy ? (
        <div
          role="status"
          className="space-y-2 rounded-xl bg-muted p-3 text-sm"
        >
          <p className="flex items-center gap-2 break-all">
            <LoaderCircle
              aria-hidden="true"
              size={16}
              className="shrink-0 animate-spin"
            />
            {activeFile
              ? `Uploading ${activeFile} · ${progress}%`
              : "Removing file…"}
          </p>
          {activeFile && (
            <progress
              aria-label="Evidence upload progress"
              value={progress}
              max={100}
              className="w-full"
            />
          )}
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
      <div
        className="flex items-center justify-between gap-2 text-sm"
        aria-live="polite"
      >
        <p className="inline-flex items-center gap-2 font-medium">
          {files.length > 0 && <Check aria-hidden="true" size={16} />}
          {files.length ? "Attached files" : "No files attached yet"}
        </p>
        <span className="shrink-0 text-muted-foreground">
          {files.length} / {MAX_EVIDENCE_FILES}
        </span>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {files.map((file) => (
          <div key={file.id} className="space-y-2">
            <EvidencePreview file={file} storage={storage} />
            {file.uploaderId === actor.id && !file.submittedAt ? (
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => void remove(file)}
                aria-label={`Remove ${file.fileName}`}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                <Trash2 aria-hidden="true" size={15} /> Remove file
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {storage.mode === "browser-demo" && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Demo files stay in this browser. They are not shared with other
          devices.
        </p>
      )}
    </section>
  );
}
