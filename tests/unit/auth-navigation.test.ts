import { describe, expect, it } from "vitest";
import { safeNextPath } from "../../src/lib/auth/navigation";

describe("safe authentication redirects", () => {
  it("preserves internal paths and query strings", () => {
    expect(safeNextPath("/invite/token?from=email")).toBe(
      "/invite/token?from=email",
    );
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example"])(
    "rejects external or ambiguous target %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/agreements/new");
    },
  );

  it("uses the default destination for absent or relative values", () => {
    expect(safeNextPath(null)).toBe("/agreements/new");
    expect(safeNextPath("agreements/new")).toBe("/agreements/new");
  });
});
