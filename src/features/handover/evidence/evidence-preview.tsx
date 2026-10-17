"use client";
import { useEffect, useState } from "react";
import type { EvidenceFile, EvidenceStorage } from "../contracts";
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The file action failed. Please retry.";
}
export function EvidencePreview({
  file,
  storage,
}: {
  file: EvidenceFile;
  storage: EvidenceStorage;
}) {
  const [resource, setResource] = useState<{ url: string } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    void attempt;
    let active = true;
    let release: (() => void) | undefined;
    setResource(null);
    setError("");
    storage
      .getUrl(file)
      .then((result) => {
        release = result.release;
        if (active) setResource(result);
        else release?.();
      })
      .catch((reason) => {
        if (active) setError(message(reason));
      });
    return () => {
      active = false;
      release?.();
    };
  }, [file, storage, attempt]);
  if (error)
    return (
      <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        <p>{error}</p>
        <button
          type="button"
          className="mt-2 underline"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Retry preview
        </button>
      </div>
    );
  if (!resource)
    return (
      <p role="status" className="p-3 text-sm text-slate-500">
        Loading evidence…
      </p>
    );
  return (
    <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {file.mimeType === "application/pdf" ? (
        <a
          href={resource.url}
          target="_blank"
          rel="noreferrer"
          className="block p-6 font-medium underline"
        >
          Open PDF: {file.fileName}
        </a>
      ) : (
        // Private object URLs are created at runtime and cannot use the Next image optimizer.
        // biome-ignore lint/performance/noImgElement: Private evidence requires an ephemeral object or signed URL.
        <img
          src={resource.url}
          alt={file.caption || file.fileName}
          className="h-40 w-full object-contain"
        />
      )}
      <figcaption className="p-3 text-sm">
        <p className="font-medium break-words">{file.fileName}</p>
        {file.caption ? (
          <p className="mt-1 text-slate-600">{file.caption}</p>
        ) : null}
        <p className="mt-1 text-xs text-slate-500">
          {file.submittedAt ? "Submitted · preserved" : "Draft"} ·{" "}
          {(file.sizeBytes / 1_000_000).toFixed(2)} MB
        </p>
      </figcaption>
    </figure>
  );
}
