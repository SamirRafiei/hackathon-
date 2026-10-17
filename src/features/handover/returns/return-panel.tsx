"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  BaselineRecord,
  EvidenceFile,
  EvidenceStorage,
  HandoverActor,
  ReturnRecord,
} from "../contracts";
import { EvidenceUploader } from "../evidence/evidence-uploader";
import { EvidencePreview } from "../evidence/evidence-preview";
import { createReturnRecord } from "./return-record";

export type ReturnPanelProps = {
  agreementId: string;
  actor: HandoverActor;
  baseline: BaselineRecord | null;
  ownerId: string;
  renterId: string;
  record: ReturnRecord | null;
  storage: EvidenceStorage;
  active: boolean;
  onSubmitReturn: (record: ReturnRecord) => void;
};

function displayDate(value: string) {
  return `${new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

export function ReturnPanel(props: ReturnPanelProps) {
  if (props.actor.id !== props.ownerId && props.actor.id !== props.renterId) {
    return null;
  }
  if (props.record) {
    const { record } = props;
    return (
      <section
        className="space-y-5 rounded-3xl border border-stone-200 bg-white p-6"
        aria-label="Submitted return declaration"
      >
        <div>
          <p className="text-xs font-semibold tracking-wider text-emerald-800 uppercase">
            Return declared
          </p>
          <h3 className="mt-2 text-xl font-semibold text-stone-900">
            48-hour condition review
          </h3>
          <p className="mt-2 text-sm text-stone-600">
            The renter submitted a return declaration. This records their
            statement and evidence; it does not prove physical receipt or
            authorize a refund.
          </p>
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-stone-500">Submitted</dt>
            <dd className="mt-1 font-medium">
              <time dateTime={record.submittedAt}>
                {displayDate(record.submittedAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt className="text-stone-500">Inspection deadline</dt>
            <dd className="mt-1 font-medium">
              <time dateTime={record.inspectionDeadline}>
                {displayDate(record.inspectionDeadline)}
              </time>
            </dd>
          </div>
          <div>
            <dt className="text-stone-500">Return location</dt>
            <dd className="mt-1 font-medium break-words">{record.location}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Baseline</dt>
            <dd className="mt-1 font-medium">
              Version {record.baselineVersion}
            </dd>
          </div>
        </dl>
        <p className="text-sm text-stone-600">
          This first declaration and its deadline are fixed. Viewing,
          acknowledging, or uploading evidence cannot restart the inspection
          window.
        </p>
        <ul className="space-y-2 text-sm">
          {record.checklist.map((item) => (
            <li key={item.id} className="rounded-xl bg-stone-50 p-3">
              <span className="font-medium">
                {item.label}: {item.checked ? "Returned" : "Exception reported"}
              </span>
              {item.note && (
                <p className="mt-1 break-words text-stone-600">{item.note}</p>
              )}
            </li>
          ))}
        </ul>
        {record.notes && (
          <p className="text-sm break-words whitespace-pre-wrap text-stone-600">
            {record.notes}
          </p>
        )}
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
    );
  }
  const ready =
    props.baseline &&
    props.baseline.agreementId === props.agreementId &&
    props.baseline.acknowledgedBy[props.ownerId] &&
    props.baseline.acknowledgedBy[props.renterId];
  const reason = !props.active
    ? "Return declaration becomes available when the agreement is active."
    : !ready
      ? "Both parties must acknowledge the current condition baseline before a return can be declared."
      : props.actor.id !== props.renterId || props.actor.role !== "renter"
        ? "The renter can submit the return declaration and condition evidence here."
        : null;
  if (reason || !props.baseline) {
    return (
      <section
        className="rounded-3xl border border-stone-200 bg-white p-6"
        aria-label="Return declaration"
      >
        <h3 className="text-xl font-semibold text-stone-900">
          Return declaration
        </h3>
        <p className="mt-2 text-sm text-stone-600">{reason}</p>
      </section>
    );
  }
  return (
    <ReturnForm
      key={`${props.agreementId}/${props.baseline.id}/${props.baseline.version}/${props.actor.id}`}
      {...props}
      baseline={props.baseline}
    />
  );
}

function ReturnForm(props: ReturnPanelProps & { baseline: BaselineRecord }) {
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState(() =>
    props.baseline.checklist.map((item) => ({
      ...item,
      checked: false,
      note: "",
    })),
  );
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const onUploadBusyChange = useCallback((value: boolean) => {
    uploadingRef.current = value;
    setUploading(value);
  }, []);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const [declared, setDeclared] = useState(false);
  const mounted = useRef(true);
  const context = `${props.agreementId}/${props.actor.id}/${props.actor.role}/${props.ownerId}/${props.renterId}/${props.baseline.id}/${props.baseline.version}/${props.baseline.termsVersion}/${props.active}`;
  const currentContext = useRef(context);
  currentContext.current = context;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || uploadingRef.current || declared) return;
    const submissionContext = context;
    const isCurrent = () =>
      mounted.current && currentContext.current === submissionContext;
    submitting.current = true;
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
        active: props.active,
        baseline: props.baseline,
        baselineId: props.baseline.id,
        baselineVersion: props.baseline.version,
        existingRecord: props.record,
        location,
        notes,
        checklist,
        evidence: files,
        now,
      };
      // Check the form before making uploaded evidence immutable.
      createReturnRecord({
        ...draft,
        evidence: files.map((file) => ({
          ...file,
          submittedAt: file.submittedAt ?? now,
        })),
      });
      const evidence = await Promise.all(
        files.map((file) => props.storage.finalize(file)),
      );
      if (!isCurrent()) return;
      props.onSubmitReturn(createReturnRecord({ ...draft, evidence }));
      setDeclared(true);
    } catch (cause) {
      if (!isCurrent()) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "The declaration could not be saved. Please retry.",
      );
    } finally {
      if (isCurrent()) setBusy(false);
      submitting.current = false;
    }
  }
  const disabled = busy || declared;
  return (
    <section
      className="space-y-5 rounded-3xl border border-stone-200 bg-white p-6"
      aria-label="Return declaration"
    >
      <div>
        <p className="text-xs font-semibold tracking-wider text-emerald-800 uppercase">
          Return / move out
        </p>
        <h3 className="mt-2 text-xl font-semibold text-stone-900">
          Document the return
        </h3>
        <p className="mt-2 text-sm text-stone-600">
          Add photos and confirm what you returned against baseline version{" "}
          {props.baseline.version}. Submitting starts the 48-hour inspection
          window; it does not prove the owner received the item or release the
          deposit.
        </p>
      </div>
      <form className="space-y-5" onSubmit={submit}>
        <fieldset disabled={disabled} className="space-y-5 disabled:opacity-60">
          <label className="block text-sm font-medium text-stone-800">
            Return location
            <input
              required
              maxLength={300}
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Where did you return the item or leave the keys?"
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white p-3 font-normal"
            />
          </label>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium text-stone-800">
              Keys, inventory, and accessories
            </legend>
            {checklist.length === 0 && (
              <p className="text-sm text-stone-600">
                No checklist items were listed in the baseline.
              </p>
            )}
            {checklist.map((item) => (
              <div
                key={item.id}
                className="space-y-2 rounded-xl bg-stone-50 p-3"
              >
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(event) =>
                      setChecklist((items) =>
                        items.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, checked: event.target.checked }
                            : entry,
                        ),
                      )
                    }
                    className="size-4 accent-emerald-800"
                  />
                  <span>{item.label} returned</span>
                </label>
                <label className="block text-xs text-stone-600">
                  {item.checked
                    ? "Condition note (optional)"
                    : "Explain missing or changed condition"}
                  <input
                    maxLength={1000}
                    required={!item.checked}
                    value={item.note}
                    onChange={(event) =>
                      setChecklist((items) =>
                        items.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, note: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2 text-sm"
                  />
                </label>
              </div>
            ))}
          </fieldset>
          <label className="block text-sm font-medium text-stone-800">
            Return condition notes
            <textarea
              maxLength={4000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Describe any changes, damage, or special return instructions followed."
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white p-3 font-normal"
            />
          </label>
        </fieldset>
        <EvidenceUploader
          agreementId={props.agreementId}
          phase="return"
          actor={props.actor}
          storage={props.storage}
          files={files}
          onChange={setFiles}
          onBusyChange={onUploadBusyChange}
          disabled={disabled}
        />
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {declared && (
          <p role="status" className="text-sm text-emerald-800">
            Return declaration saved. The inspection deadline is fixed.
          </p>
        )}
        <button
          disabled={disabled || uploading}
          type="submit"
          className="rounded-full bg-emerald-900 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? "Saving return declaration…"
            : declared
              ? "Return declared"
              : "Submit return declaration"}
        </button>
      </form>
    </section>
  );
}
