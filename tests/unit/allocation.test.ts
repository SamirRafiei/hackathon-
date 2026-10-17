// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  allocateContributions,
  AllocationError,
} from "../../src/lib/domain/allocation";
import type { BorrowerShare, Currency } from "../../src/lib/domain/model";

const id = (n: number) =>
  `00000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;
const shares = (...values: number[]): BorrowerShare[] =>
  values.map((shareBps, index) => ({ participantId: id(index + 1), shareBps }));
const allocate = (amountMinor: number, split: readonly BorrowerShare[]) =>
  allocateContributions({ currency: "EUR", amountMinor }, split);

describe("largest-remainder contribution allocation", () => {
  it("allocates the required EUR 250 group example", () => {
    expect(
      allocate(25000, shares(6000, 4000)).map((row) => row.amountMinor),
    ).toEqual([15000, 10000]);
  });
  it.each(["EUR", "USD", "GBP"] as const)(
    "supports %s without currency conversion",
    (currency) => {
      expect(
        allocateContributions(
          { currency, amountMinor: 12345 },
          shares(10000),
        )[0].amountMinor,
      ).toBe(12345);
    },
  );
  it("allocates odd cents to the greatest remainder", () => {
    expect(
      allocate(101, shares(3333, 3333, 3334)).map((row) => row.amountMinor),
    ).toEqual([34, 33, 34]);
  });
  it("uses canonical UUID ordering for ties regardless of input order or case", () => {
    const split = [
      { participantId: id(11).toUpperCase(), shareBps: 5000 },
      { participantId: id(10), shareBps: 5000 },
    ];
    expect(allocate(3, split)).toEqual([
      { participantId: id(10), shareBps: 5000, amountMinor: 2 },
      { participantId: id(11), shareBps: 5000, amountMinor: 1 },
    ]);
    expect(allocate(3, split)).toEqual(allocate(3, [...split].reverse()));
  });
  it("does not mutate its arguments", () => {
    const split = Object.freeze(
      shares(6000, 4000).map((row) => Object.freeze(row)),
    );
    expect(allocate(25000, split)).toHaveLength(2);
    expect(split).toEqual(shares(6000, 4000));
  });
  it.each([0, -1, 1.1, NaN, Infinity, 100000001, Number.MAX_SAFE_INTEGER])(
    "rejects invalid deposit %s",
    (amount) => {
      expect(() => allocate(amount, shares(10000))).toThrow("invalid_amount");
    },
  );
  it.each([0, -1, 0.5, NaN, Infinity, 10001])(
    "rejects invalid share %s",
    (share) => {
      expect(() => allocate(100, shares(share))).toThrow("invalid_share");
    },
  );
  it("rejects invalid totals, counts, currencies and identities", () => {
    expect(() => allocate(100, shares(5000, 4999))).toThrow(
      "invalid_share_total",
    );
    expect(() => allocate(100, shares())).toThrow("invalid_participant_count");
    expect(() => allocate(100, shares(...Array(21).fill(500)))).toThrow(
      "invalid_participant_count",
    );
    expect(() =>
      allocateContributions(
        { currency: "JPY" as Currency, amountMinor: 100 },
        shares(10000),
      ),
    ).toThrow("invalid_currency");
    expect(() =>
      allocate(100, [{ participantId: "not-a-uuid", shareBps: 10000 }]),
    ).toThrow("invalid_participant_id");
    expect(() =>
      allocate(100, [
        { participantId: id(10), shareBps: 5000 },
        { participantId: id(10).toUpperCase(), shareBps: 5000 },
      ]),
    ).toThrow("duplicate_participant");
  });
  it("rejects any split producing a zero contribution, even with enough total cents", () => {
    expect(() => allocate(1, shares(5000, 5000))).toThrow("deposit_too_small");
    expect(() => allocate(20, shares(9999, 1))).toThrow("deposit_too_small");
    expect(
      allocate(2, shares(5000, 5000)).map((row) => row.amountMinor),
    ).toEqual([1, 1]);
  });
  it("supports the maximum deposit and borrower count exactly", () => {
    const result = allocate(100000000, shares(...Array(20).fill(500)));
    expect(result.every((row) => row.amountMinor === 5000000)).toBe(true);
  });
  it("conserves amounts and stays within each exact quota across 2,000 deterministic cases", () => {
    let seed = 123456;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (let run = 0; run < 2000; run++) {
      const count = 2 + (random() % 19);
      const cuts = new Set<number>([0, 10000]);
      while (cuts.size < count + 1) cuts.add(1 + (random() % 9999));
      const sorted = [...cuts].sort((a, b) => a - b);
      const split = shares(
        ...sorted.slice(1).map((value, index) => value - sorted[index]),
      );
      const amount = 10000 + (random() % 99990001);
      const result = allocate(amount, split);
      expect(result.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(
        amount,
      );
      for (const row of result) {
        const numerator = BigInt(amount) * BigInt(row.shareBps);
        const floor = Number(numerator / BigInt(10000));
        expect(row.amountMinor).toBeGreaterThanOrEqual(floor);
        expect(row.amountMinor).toBeLessThanOrEqual(
          floor + (numerator % BigInt(10000) === BigInt(0) ? 0 : 1),
        );
      }
      expect(allocate(amount, [...split].reverse())).toEqual(result);
    }
  });
  it("exposes a typed recoverable validation error", () => {
    try {
      allocate(0, shares(10000));
    } catch (error) {
      expect(error).toBeInstanceOf(AllocationError);
      expect((error as AllocationError).code).toBe("invalid_amount");
    }
  });
});
