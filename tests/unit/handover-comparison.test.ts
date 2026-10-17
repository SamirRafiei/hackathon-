import { describe, expect, it } from "vitest";
import { compareChecklist } from "@/features/handover/comparison/model";

describe("compareChecklist", () => {
  const item = {
    id: "keys",
    label: "Two keys",
    checked: true,
    note: "Original keys",
  };

  it("matches by ID despite reordered and renamed entries, retaining unchecked exceptions", () => {
    const rows = compareChecklist(
      [item, { ...item, id: "lens", label: "Lens" }],
      [
        { ...item, id: "lens", label: "Lens" },
        { ...item, label: "Key set", checked: false, note: "Only one key" },
      ],
    );
    expect(rows[0]).toMatchObject({
      id: "keys",
      status: "changed",
      checkedChanged: true,
      noteChanged: true,
      labelChanged: true,
    });
    expect(rows[1].status).toBe("unchanged");
  });

  it("does not silently pair equal labels when stable IDs differ", () => {
    const rows = compareChecklist([item], [{ ...item, id: "replacement" }]);
    expect(rows.map((row) => row.status)).toEqual([
      "baseline-only",
      "return-only",
    ]);
    expect(rows[0].returned).toBeNull();
    expect(rows[1].baseline).toBeNull();
  });

  it("marks duplicate IDs as ambiguous rather than claiming a match", () => {
    expect(
      compareChecklist([item, { ...item, checked: false }], [item])[0].status,
    ).toBe("ambiguous");
    expect(compareChecklist([item], [item, item])[0].status).toBe("ambiguous");
  });

  it("handles empty lists without changing inputs", () => {
    expect(compareChecklist([], [])).toEqual([]);
    const original = structuredClone(item);
    compareChecklist([item], [{ ...item, note: "Changed" }]);
    expect(item).toEqual(original);
  });
});
