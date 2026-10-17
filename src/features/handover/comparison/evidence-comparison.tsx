"use client";

import type {
  BaselineRecord,
  ChecklistItem,
  EvidenceFile,
  EvidenceStorage,
  ReturnRecord,
} from "../contracts";
import { EvidencePreview } from "../evidence/evidence-preview";
import { compareChecklist } from "./model";

export type EvidenceComparisonProps = {
  baseline: BaselineRecord | null;
  returnRecord: ReturnRecord | null;
  storage: EvidenceStorage;
};

function RecordTime({ value }: { value: string }) {
  const date = new Date(value);
  return (
    <time dateTime={value}>
      {Number.isNaN(date.getTime())
        ? "Date unavailable"
        : `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date)} UTC`}
    </time>
  );
}

function ChecklistValue({ item }: { item: ChecklistItem | null }) {
  if (!item) return <p className="text-sm text-stone-500">Not recorded</p>;
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium text-stone-900">{item.label}</p>
      <p
        className={
          item.checked ? "text-emerald-800" : "font-medium text-amber-800"
        }
      >
        {item.checked ? "Confirmed" : "Not confirmed — review exception"}
      </p>
      <p className="whitespace-pre-wrap text-stone-600">
        {item.note || "No item notes"}
      </p>
    </div>
  );
}

function EvidenceList({
  files,
  storage,
  agreementId,
  phase,
}: {
  files: EvidenceFile[];
  storage: EvidenceStorage;
  agreementId: string;
  phase: "baseline" | "return";
}) {
  if (!files.length)
    return <p className="text-sm text-stone-500">No evidence attached.</p>;
  return (
    <ul className="space-y-4">
      {files.map((file) => (
        <li key={file.id} className="rounded-xl border border-stone-200 p-3">
          {file.agreementId !== agreementId || file.phase !== phase ? (
            <p role="alert" className="text-sm text-amber-800">
              Evidence does not match this agreement and record stage. Preview
              withheld.
            </p>
          ) : (
            <>
              <EvidencePreview file={file} storage={storage} />
              <p className="mt-2 text-sm font-medium break-words text-stone-900">
                {file.fileName}
              </p>
              <p className="text-xs text-stone-500">
                Uploaded by {file.uploaderId} ·{" "}
                <RecordTime value={file.createdAt} />
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-stone-600">
                {file.caption || "No caption provided"}
              </p>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Supply the authenticated storage adapter from a client parent. Read-only; no outcome is inferred. */
export function EvidenceComparison({
  baseline,
  returnRecord,
  storage,
}: EvidenceComparisonProps) {
  if (
    baseline &&
    returnRecord &&
    (baseline.agreementId !== returnRecord.agreementId ||
      baseline.id !== returnRecord.baselineId ||
      baseline.version !== returnRecord.baselineVersion)
  ) {
    return (
      <section
        aria-label="Condition evidence comparison"
        className="rounded-3xl border border-amber-200 bg-amber-50 p-6"
      >
        <h3 className="text-xl font-semibold text-stone-900">
          Comparison unavailable
        </h3>
        <p role="alert" className="mt-2 text-sm text-amber-900">
          The return does not reference this agreement and baseline version.
          Load the matching baseline before comparing evidence.
        </p>
      </section>
    );
  }
  const rows =
    baseline && returnRecord
      ? compareChecklist(baseline.checklist, returnRecord.checklist)
      : [];
  return (
    <section
      aria-label="Condition evidence comparison"
      className="space-y-6 rounded-3xl border border-stone-200 bg-white p-6"
    >
      <div>
        <h3 className="text-xl font-semibold text-stone-900">
          Condition evidence comparison
        </h3>
        <p className="mt-2 text-sm text-stone-600">
          Review the recorded observations together. Differences do not
          establish damage, responsibility, or a deposit deduction.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <section
          aria-label="Baseline evidence"
          className="space-y-4 rounded-2xl bg-stone-50 p-4"
        >
          <h4 className="font-semibold text-stone-900">Before handover</h4>
          {baseline ? (
            <>
              <p className="text-sm text-stone-600">
                Baseline version {baseline.version} ·{" "}
                <RecordTime value={baseline.publishedAt} />
              </p>
              <p className="text-sm font-medium text-stone-900">
                {baseline.identifier}
              </p>
              <p className="text-sm whitespace-pre-wrap text-stone-600">
                {baseline.notes || "No baseline notes"}
              </p>
              <EvidenceList
                files={baseline.evidence}
                storage={storage}
                agreementId={baseline.agreementId}
                phase="baseline"
              />
            </>
          ) : (
            <p className="text-sm text-stone-600">
              No baseline record is available. A published baseline is needed
              for comparison.
            </p>
          )}
        </section>
        <section
          aria-label="Return evidence"
          className="space-y-4 rounded-2xl bg-stone-50 p-4"
        >
          <h4 className="font-semibold text-stone-900">At return</h4>
          {returnRecord ? (
            <>
              <p className="text-sm text-stone-600">
                Submitted by {returnRecord.submittedBy} ·{" "}
                <RecordTime value={returnRecord.submittedAt} />
              </p>
              <p className="text-sm font-medium text-stone-900">
                Return location: {returnRecord.location || "Not recorded"}
              </p>
              <p className="text-sm whitespace-pre-wrap text-stone-600">
                {returnRecord.notes || "No return notes"}
              </p>
              <EvidenceList
                files={returnRecord.evidence}
                storage={storage}
                agreementId={returnRecord.agreementId}
                phase="return"
              />
            </>
          ) : (
            <p className="text-sm text-stone-600">
              No return declaration has been submitted yet.
            </p>
          )}
        </section>
      </div>
      {baseline && returnRecord && (
        <div className="space-y-4">
          <h4 className="font-semibold text-stone-900">
            Checklist observations
          </h4>
          {baseline.notes !== returnRecord.notes && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Overall notes differ. Read both records above.
            </p>
          )}
          {!rows.length && (
            <p className="text-sm text-stone-500">
              Neither record contains checklist observations.
            </p>
          )}
          {rows.map((row) => (
            <article
              key={row.id}
              className="space-y-3 rounded-xl border border-stone-200 p-4"
            >
              <p className="text-xs font-medium text-stone-500">
                Item ID: {row.id}
              </p>
              <p
                className={`text-sm font-medium ${row.status === "unchanged" ? "text-stone-600" : "text-amber-800"}`}
              >
                {row.status === "ambiguous"
                  ? "Duplicate item ID — cannot reliably match these entries"
                  : row.status === "baseline-only"
                    ? "Missing from return checklist"
                    : row.status === "return-only"
                      ? "Additional return entry — no matching baseline item"
                      : row.status === "changed"
                        ? `Recorded differences: ${[row.checkedChanged && "confirmation", row.noteChanged && "notes", row.labelChanged && "label"].filter(Boolean).join(", ")}`
                        : "Same recorded observation"}
              </p>
              {row.status !== "ambiguous" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold text-stone-500">
                      Baseline
                    </p>
                    <ChecklistValue item={row.baseline} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold text-stone-500">
                      Return
                    </p>
                    <ChecklistValue item={row.returned} />
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
