import { describe, expect, it } from "vitest";
import { DEMO_AGREEMENT_PRESETS } from "@/features/demo/agreement-presets";
import {
  createDemoAgreement,
  createInitialDemoSnapshot,
  parseDemoDepositAmount,
  validateDemoAgreementInput,
} from "@/features/demo/model";
import { demoActors } from "@/lib/auth/identity-provider";

describe("agreed presentation setup", () => {
  it("uses the same apartment values for reset and creation", () => {
    const example = DEMO_AGREEMENT_PRESETS.APARTMENT;
    expect(createInitialDemoSnapshot().agreement).toMatchObject(example);
    expect(
      createDemoAgreement(demoActors.landlord, example).agreement,
    ).toMatchObject({
      ...example,
      acceptedBy: { landlord: true, tenant: false },
      reservedMinor: 0,
    });
  });
  it.each(Object.values(DEMO_AGREEMENT_PRESETS))(
    "validates the $assetType example",
    (example) => {
      expect(validateDemoAgreementInput(example)).toEqual(example);
    },
  );
  it.each([
    ["1", 100],
    ["1.01", 101],
    ["300.29", 30_029],
    ["1000000", 100_000_000],
  ])("parses %s as %i minor units without rounding", (value, expected) => {
    expect(parseDemoDepositAmount(value)).toBe(expected);
  });
  it.each(["", "0", "-1", "NaN", "Infinity", "1e3", "300.001", "1000000.01"])(
    "rejects invalid or fractional-cent amount %s",
    (value) => {
      expect(() => parseDemoDepositAmount(value)).toThrow("Enter a deposit");
    },
  );
});
