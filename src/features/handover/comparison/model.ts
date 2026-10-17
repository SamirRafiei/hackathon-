import type { ChecklistItem } from "../contracts";

export type ChecklistComparison = {
  id: string;
  baseline: ChecklistItem | null;
  returned: ChecklistItem | null;
  status:
    "unchanged" | "changed" | "baseline-only" | "return-only" | "ambiguous";
  checkedChanged: boolean;
  noteChanged: boolean;
  labelChanged: boolean;
};

/** Match by stable IDs only. Renamed labels never pair unrelated items. */
export function compareChecklist(
  baseline: readonly ChecklistItem[],
  returned: readonly ChecklistItem[],
): ChecklistComparison[] {
  const ids = new Set([...baseline, ...returned].map((item) => item.id));
  return [...ids].map((id) => {
    const before = baseline.filter((item) => item.id === id);
    const after = returned.filter((item) => item.id === id);
    const original = before[0] ?? null;
    const current = after[0] ?? null;
    const checkedChanged =
      !!original && !!current && original.checked !== current.checked;
    const noteChanged =
      !!original && !!current && original.note !== current.note;
    const labelChanged =
      !!original && !!current && original.label !== current.label;
    const status =
      before.length > 1 || after.length > 1
        ? "ambiguous"
        : !original
          ? "return-only"
          : !current
            ? "baseline-only"
            : checkedChanged || noteChanged || labelChanged
              ? "changed"
              : "unchanged";
    return {
      id,
      baseline: original,
      returned: current,
      status,
      checkedChanged,
      noteChanged,
      labelChanged,
    };
  });
}
