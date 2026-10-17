"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AssetType,
  BaselineRecord,
  EvidenceFile,
  EvidenceStorage,
  HandoverActor,
} from "../contracts";
import { EvidenceUploader } from "../evidence/evidence-uploader";
import { EvidencePreview } from "../evidence/evidence-preview";
import {
  acknowledgeBaseline,
  baselineChecklist,
  publishBaseline,
} from "./model";

export type BaselinePanelProps = {
  agreementId: string;
  assetType: AssetType;
  termsVersion: number;
  actor: HandoverActor;
  ownerId: string;
  renterId: string;
  record: BaselineRecord | null;
  onChange: (record: BaselineRecord) => void;
  storage: EvidenceStorage;
  locked?: boolean;
  demoPreset?: {
    identifier: string;
    notes: string;
    checklistNotes: string[];
  };
};

export function BaselinePanel(props: BaselinePanelProps) {
  return (
    <BaselinePanelContent
      key={`${props.agreementId}:${props.actor.id}:${props.actor.role}:${props.ownerId}:${props.renterId}:${props.assetType}:${props.termsVersion}`}
      {...props}
    />
  );
}

function BaselinePanelContent(props: BaselinePanelProps) {
  const {
    agreementId,
    assetType,
    termsVersion,
    actor,
    ownerId,
    renterId,
    record,
    onChange,
    storage,
    locked = false,
  } = props;
  const [editing, setEditing] = useState(false);
  const preset = storage.mode === "browser-demo" ? props.demoPreset : undefined;
  const [identifier, setIdentifier] = useState(preset?.identifier ?? "");
  const [notes, setNotes] = useState(preset?.notes ?? "");
  const [checklist, setChecklist] = useState(() =>
    baselineChecklist(assetType).map((item, index) => ({
      ...item,
      checked: !!preset,
      note: preset?.checklistNotes[index] ?? "",
    })),
  );
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const current = useRef(props);
  current.current = props;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isOwner = actor.role === "owner" && actor.id === ownerId;
  const participant =
    isOwner || (actor.role === "renter" && actor.id === renterId);
  const matching =
    record?.agreementId === agreementId && record.assetType === assetType;
  const currentTerms = matching && record.termsVersion === termsVersion;
  const editable = isOwner && !locked;
  const showingEditor = editable && (!record || editing);

  function beginRevision() {
    if (!editable || busy || uploading) return;
    setIdentifier(matching ? record.identifier : "");
    setNotes(matching ? record.notes : "");
    setChecklist(
      matching
        ? record.checklist.map((item) => ({ ...item }))
        : baselineChecklist(assetType),
    );
    // A new version has its own uploads; earlier submitted evidence stays immutable.
    setFiles([]);
    setError("");
    setEditing(true);
  }

  async function publish() {
    if (busy || uploading || !editable) return;
    setError("");
    const startedWith = props;
    const input = {
      agreementId,
      assetType,
      termsVersion,
      actor,
      ownerId,
      previous: record,
      identifier,
      notes,
      checklist,
      evidence: files,
      now: new Date().toISOString(),
      id: crypto.randomUUID(),
      locked,
    };
    try {
      publishBaseline({
        ...input,
        evidence: files.map((file) => ({
          ...file,
          submittedAt: file.submittedAt ?? input.now,
        })),
      });
      setBusy(true);
      const finalized: EvidenceFile[] = [];
      for (const file of files) {
        if (!mounted.current || current.current !== startedWith) return;
        finalized.push(file.submittedAt ? file : await storage.finalize(file));
      }
      if (!mounted.current || current.current !== startedWith) return;
      onChange(publishBaseline({ ...input, evidence: finalized }));
      setEditing(false);
    } catch (reason) {
      if (mounted.current && current.current === startedWith)
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not publish the condition record. Please retry.",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function acknowledge() {
    if (!record || !participant || !currentTerms) return;
    try {
      onChange(
        acknowledgeBaseline({
          record,
          agreementId,
          termsVersion,
          baselineId: record.id,
          baselineVersion: record.version,
          actor,
          ownerId,
          renterId,
          now: new Date().toISOString(),
        }),
      );
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not acknowledge this record.",
      );
    }
  }

  if (!participant)
    return (
      <p className="rounded-2xl border border-slate-200 p-5">
        Condition records are available to agreement participants.
      </p>
    );

  return (
    <section
      className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5"
      aria-label="Initial condition record"
    >
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          Initial condition record
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Record identifying details, included items and existing damage before
          the exchange.
        </p>
      </div>
      {storage.mode === "browser-demo" && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Demo evidence is stored in this browser. It is not shared with other
          devices.
        </p>
      )}
      {record && !matching && (
        <p role="alert">This condition record belongs to another agreement.</p>
      )}
      {matching && (
        <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
          <p className="text-sm font-medium">
            Condition version {record.version} · Terms version{" "}
            {record.termsVersion}
          </p>
          <p className="font-medium">{record.identifier}</p>
          {record.notes && (
            <p className="text-sm whitespace-pre-wrap">{record.notes}</p>
          )}
          <ul className="space-y-2 text-sm">
            {record.checklist.map((item) => (
              <li key={item.id}>
                {item.checked ? "✓ " : "○ "}
                {item.label}
                {item.note && (
                  <span className="block text-slate-600">{item.note}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            {record.evidence.map((file) => (
              <EvidencePreview key={file.id} file={file} storage={storage} />
            ))}
          </div>
          <p className="text-sm">
            Owner:{" "}
            {record.acknowledgedBy[ownerId]
              ? "Acknowledged"
              : "Awaiting acknowledgment"}{" "}
            · Borrower:{" "}
            {record.acknowledgedBy[renterId]
              ? "Acknowledged"
              : "Awaiting acknowledgment"}
          </p>
          {!currentTerms && (
            <p className="text-sm text-amber-800">
              The terms changed. The owner must publish a new condition version.
            </p>
          )}
          {currentTerms && !record.acknowledgedBy[actor.id] && (
            <button
              type="button"
              onClick={acknowledge}
              className="rounded-full bg-lime-300 px-4 py-2 font-medium"
            >
              I acknowledge condition version {record.version}
            </button>
          )}
        </div>
      )}
      {editable && record && !editing && (
        <button
          type="button"
          onClick={beginRevision}
          className="rounded-full border border-slate-300 px-4 py-2"
        >
          Create a new condition version
        </button>
      )}
      {showingEditor && (
        <div className="space-y-4">
          {preset && (
            <p className="rounded-xl bg-lime-50 p-3 text-sm text-slate-700">
              Demo details are prefilled and editable. Review the checklist,
              upload your photos, then publish the condition record.
            </p>
          )}
          <label className="block space-y-1 text-sm font-medium">
            <span>
              {assetType === "APARTMENT"
                ? "Property address and identifying details"
                : "Item model and serial / identifying number"}
            </span>
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              disabled={busy}
              maxLength={240}
              className="w-full rounded-xl border border-slate-300 p-3"
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>Condition and existing damage</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={busy}
              maxLength={5000}
              className="w-full rounded-xl border border-slate-300 p-3"
            />
          </label>
          <fieldset disabled={busy} className="space-y-3">
            <legend className="mb-2 font-medium">
              Check every item and add quantities or details
            </legend>
            {checklist.map((item, index) => (
              <div key={item.id} className="space-y-2">
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(event) =>
                      setChecklist((items) =>
                        items.map((entry, i) =>
                          i === index
                            ? { ...entry, checked: event.target.checked }
                            : entry,
                        ),
                      )
                    }
                  />
                  {item.label}
                </label>
                <input
                  aria-label={`Details: ${item.label}`}
                  value={item.note}
                  onChange={(event) =>
                    setChecklist((items) =>
                      items.map((entry, i) =>
                        i === index
                          ? { ...entry, note: event.target.value }
                          : entry,
                      ),
                    )
                  }
                  placeholder="Counts, condition or existing issues"
                  maxLength={2000}
                  className="w-full rounded-xl border border-slate-300 p-2 text-sm"
                />
              </div>
            ))}
          </fieldset>
          <EvidenceUploader
            agreementId={agreementId}
            phase="baseline"
            actor={actor}
            storage={storage}
            files={files}
            onChange={setFiles}
            disabled={busy}
            onBusyChange={setUploading}
          />
          <p className="text-sm text-slate-600">
            Publishing acknowledges this exact version as the owner. A revision
            requires fresh borrower acknowledgment and photographs.
          </p>
          <button
            type="button"
            onClick={publish}
            disabled={busy || uploading}
            className="rounded-full bg-lime-300 px-5 py-3 font-medium disabled:opacity-50"
          >
            {busy ? "Publishing…" : "Publish condition record"}
          </button>
          {record && (
            <button
              type="button"
              disabled={busy || uploading}
              onClick={() => setEditing(false)}
              className="ml-3 rounded-full border border-slate-300 px-4 py-3"
            >
              Cancel revision
            </button>
          )}
        </div>
      )}
      {!record && !isOwner && (
        <p className="text-sm text-slate-600">
          Waiting for the owner to publish the initial condition record.
        </p>
      )}
      {locked && (
        <p className="text-sm text-slate-600">
          The published condition record is locked for this active agreement.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
