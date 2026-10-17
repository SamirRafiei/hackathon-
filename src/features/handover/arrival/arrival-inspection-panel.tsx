"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  ArrivalRecord,
  EvidenceFile,
  EvidenceStorage,
  HandoverActor,
  ListingSnapshot,
} from "../contracts";
import { EvidencePreview } from "../evidence/evidence-preview";
import { EvidenceUploader } from "../evidence/evidence-uploader";
import { createArrivalRecord } from "./model";

export type ArrivalInspectionPanelProps = {
  agreementId: string;
  actor: HandoverActor;
  ownerId: string;
  renterId: string;
  listing: ListingSnapshot;
  record: ArrivalRecord | null;
  storage: EvidenceStorage;
  enabled: boolean;
  onSubmitInspection: (record: ArrivalRecord) => void;
};
const questions = [
  ["accessConfirmed", "Could you access the property?"],
  ["available", "Was the property available for your arrival?"],
  ["matchesListing", "Does the property match the accepted listing?"],
] as const;
type Answers = Record<(typeof questions)[number][0], boolean | null>;

export function ArrivalInspectionPanel(props: ArrivalInspectionPanelProps) {
  if (props.actor.id !== props.ownerId && props.actor.id !== props.renterId)
    return null;
  const record =
    props.record?.agreementId === props.agreementId ? props.record : null;
  return (
    <section
      aria-label="Arrival inspection"
      className="space-y-5 rounded-3xl border border-stone-200 bg-white p-6"
    >
      <div>
        <p className="text-xs font-semibold tracking-wide text-emerald-800 uppercase">
          Arrival inspection
        </p>
        <h3 className="mt-2 text-xl font-semibold text-stone-900">
          Compare the property with your agreement
        </h3>
        <p className="mt-2 text-sm text-stone-600">
          Record access, availability and differences from the accepted listing.
          This inspection records evidence only and does not release or refund
          funds.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl bg-stone-50 p-4">
          <h4 className="font-semibold text-stone-900">Accepted listing</h4>
          <p className="font-medium break-words">{props.listing.title}</p>
          <p className="text-sm break-words text-stone-600">
            {props.listing.address}
          </p>
          <p className="text-sm break-words whitespace-pre-wrap text-stone-600">
            {props.listing.description}
          </p>
          <h5 className="text-sm font-medium">Promised features</h5>
          <ul className="list-inside list-disc space-y-1 text-sm text-stone-600">
            {[...new Set(props.listing.promisedFeatures)].map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>
        {record ? (
          <section
            className="space-y-3"
            aria-label="Submitted arrival inspection"
          >
            <p className="font-medium text-emerald-900">Inspection submitted</p>
            {questions.map(([key, label]) => (
              <p key={key} className="text-sm">
                {label} <strong>{record[key] ? "Yes" : "No"}</strong>
              </p>
            ))}
            <p className="text-sm break-words whitespace-pre-wrap">
              {record.notes}
            </p>
            {(!record.accessConfirmed ||
              !record.available ||
              !record.matchesListing) && <DiscrepancyNotice />}
            <div className="grid gap-3 sm:grid-cols-2">
              {record.evidence.map((file) => (
                <EvidencePreview
                  key={file.id}
                  file={file}
                  storage={props.storage}
                />
              ))}
            </div>
          </section>
        ) : props.enabled &&
          props.actor.id === props.renterId &&
          props.actor.role === "renter" ? (
          <ArrivalForm
            key={JSON.stringify([
              props.agreementId,
              props.actor,
              props.ownerId,
              props.renterId,
              props.listing,
            ])}
            {...props}
          />
        ) : (
          <p className="text-sm text-stone-600">
            {!props.enabled
              ? "Arrival inspection is not available yet."
              : "The renter can submit arrival photographs and inspection answers here."}
          </p>
        )}
      </div>
    </section>
  );
}
function DiscrepancyNotice() {
  return (
    <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
      If access is missing or the property differs from the listing, open a
      dispute with supporting evidence. Submitting this inspection does not open
      a claim or decide a payment automatically.
    </p>
  );
}
function ArrivalForm(props: ArrivalInspectionPanelProps) {
  const id = useId();
  const [answers, setAnswers] = useState<Answers>({
    accessConfirmed: null,
    available: null,
    matchesListing: null,
  });
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadLock = useRef(false);
  const onUploadBusyChange = useCallback((value: boolean) => {
    uploadLock.current = value;
    setUploading(value);
  }, []);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const lock = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || uploadLock.current || saved) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const draft = {
        id: crypto.randomUUID(),
        agreementId: props.agreementId,
        actor: props.actor,
        ownerId: props.ownerId,
        renterId: props.renterId,
        enabled: props.enabled,
        existingRecord: props.record,
        ...answers,
        notes,
        evidence: files,
        now,
      };
      createArrivalRecord({
        ...draft,
        evidence: files.map((file) => ({
          ...file,
          submittedAt: file.submittedAt ?? now,
        })),
      });
      const evidence = await Promise.all(
        files.map((file) => props.storage.finalize(file)),
      );
      if (
        !mounted.current ||
        !latest.current.enabled ||
        latest.current.record ||
        latest.current.storage !== props.storage
      )
        return;
      latest.current.onSubmitInspection(
        createArrivalRecord({ ...draft, evidence }),
      );
      if (mounted.current) setSaved(true);
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "The inspection could not be saved. Please retry.",
        );
    } finally {
      if (mounted.current) setBusy(false);
      lock.current = false;
    }
  }
  const disabled = busy || saved;
  return (
    <form className="space-y-4" onSubmit={submit}>
      <fieldset disabled={disabled} className="space-y-4 disabled:opacity-60">
        <legend className="mb-3 font-semibold">
          What did you find on arrival?
        </legend>
        {questions.map(([key, label]) => (
          <fieldset
            key={key}
            className="rounded-xl border border-stone-200 p-3"
          >
            <legend className="px-1 text-sm font-medium">{label}</legend>
            <div className="flex gap-5">
              {[true, false].map((value) => (
                <label
                  key={String(value)}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name={`${id}-${key}`}
                    value={String(value)}
                    checked={answers[key] === value}
                    onChange={() =>
                      setAnswers((previous) => ({ ...previous, [key]: value }))
                    }
                    className="accent-emerald-800"
                  />
                  {value ? "Yes" : "No"}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label className="block text-sm font-medium">
          Inspection notes
          <textarea
            value={notes}
            maxLength={4000}
            rows={4}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Describe any differences, missing features or access problems."
            className="mt-2 w-full rounded-xl border border-stone-300 p-3 font-normal"
          />
        </label>
      </fieldset>
      {Object.values(answers).includes(false) && <DiscrepancyNotice />}
      <EvidenceUploader
        agreementId={props.agreementId}
        phase="arrival"
        actor={props.actor}
        storage={props.storage}
        files={files}
        onChange={setFiles}
        disabled={disabled}
        onBusyChange={onUploadBusyChange}
      />
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-800">
          Inspection saved. The submitted record cannot be edited.
        </p>
      )}
      <button
        type="submit"
        disabled={disabled || uploading}
        className="rounded-full bg-emerald-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy
          ? "Saving inspection…"
          : saved
            ? "Inspection submitted"
            : "Submit arrival inspection"}
      </button>
    </form>
  );
}
