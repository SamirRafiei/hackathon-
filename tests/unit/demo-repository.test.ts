import { describe, expect, it, beforeEach } from "vitest";
import { LocalDemoRepository } from "@/features/demo/repository";
import { createInitialDemoSnapshot } from "@/features/demo/model";
import {
  activeDemoSnapshot,
  publishedBaselineSnapshot,
  reviewedBaselineSnapshot,
} from "./fixtures/handover";

describe("LocalDemoRepository", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves and reloads a valid demo snapshot", async () => {
    const repository = new LocalDemoRepository();
    const snapshot = createInitialDemoSnapshot();

    await repository.save(snapshot);

    expect(await repository.load()).toEqual(snapshot);
  });

  it("loads demo saves written before asset type and agreement terms were added", async () => {
    const repository = new LocalDemoRepository();
    const snapshot = createInitialDemoSnapshot();
    const legacy = structuredClone(snapshot);
    delete (legacy.agreement as Partial<typeof legacy.agreement>).assetType;
    delete (legacy.agreement as Partial<typeof legacy.agreement>).terms;
    window.localStorage.setItem("pact-demo-v1", JSON.stringify(legacy));

    const loaded = await repository.load();

    expect(loaded?.agreement.assetType).toBe("APARTMENT");
    expect(loaded?.agreement.terms).toContain("48-hour return review");
  });

  it("ignores malformed or invalid stored snapshots", async () => {
    const repository = new LocalDemoRepository();
    window.localStorage.setItem("pact-demo-v1", "not-json");
    expect(await repository.load()).toBeNull();

    window.localStorage.setItem(
      "pact-demo-v1",
      JSON.stringify({ activeActorId: "other" }),
    );
    expect(await repository.load()).toBeNull();
  });

  it("rejects snapshots with tampered financial state", async () => {
    const repository = new LocalDemoRepository();
    const funded = activeDemoSnapshot();
    const tampered = {
      ...funded,
      agreement: {
        ...funded.agreement,
        reservedMinor: 1,
      },
    };

    window.localStorage.setItem("pact-demo-v1", JSON.stringify(tampered));

    expect(await repository.load()).toBeNull();
  });

  it("preserves published and reviewed baselines before any funds are reserved", async () => {
    const repository = new LocalDemoRepository();
    for (const snapshot of [
      publishedBaselineSnapshot(),
      reviewedBaselineSnapshot(),
    ]) {
      await repository.save(snapshot);
      expect(await repository.load()).toEqual(snapshot);
      expect(snapshot.agreement.reservedMinor).toBe(0);
      expect(snapshot.agreement.ledger).toEqual([]);
    }
  });

  it("loads funding-first legacy saves without losing reserved funds", async () => {
    const repository = new LocalDemoRepository();
    const active = activeDemoSnapshot();
    const legacy = {
      ...active,
      agreement: {
        ...active.agreement,
        status: "FUNDED" as const,
        handover: undefined,
      },
    };
    await repository.save(legacy);
    expect(await repository.load()).toEqual(legacy);
  });

  it("removes the saved snapshot when reset", async () => {
    const repository = new LocalDemoRepository();
    await repository.save(createInitialDemoSnapshot());

    await repository.reset();

    expect(await repository.load()).toBeNull();
  });
});
