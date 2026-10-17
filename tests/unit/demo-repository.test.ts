import { describe, expect, it, beforeEach, vi } from "vitest";
import { LocalDemoRepository } from "@/features/demo/repository";
import {
  acceptTerms,
  approveFullRefund,
  approveSplit,
  createDemoAgreement,
  createInitialDemoSnapshot,
  declineSplit,
  fundAgreement,
  proposeSplit,
} from "@/features/demo/model";
import { demoActors } from "@/lib/auth/identity-provider";
import { returnReviewDemoSnapshot } from "./fixtures/handover";

describe("LocalDemoRepository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("saves and reloads a valid demo snapshot", async () => {
    const repository = new LocalDemoRepository();
    const snapshot = createInitialDemoSnapshot();

    await repository.save(snapshot);

    expect(await repository.load()).toEqual(snapshot);
  });

  it("reloads funded, returned, and fully refunded state after a rejected split", async () => {
    const repository = new LocalDemoRepository();
    const funded = fundAgreement(
      acceptTerms(createInitialDemoSnapshot(), demoActors.tenant),
      demoActors.tenant,
    );
    repository.save(funded);
    expect((await repository.load())?.agreement.reservedMinor).toBe(100_000);

    const returned = returnReviewDemoSnapshot();
    repository.save(returned);
    expect((await repository.load())?.agreement.status).toBe("RETURN_REVIEW");
    expect((await repository.load())?.agreement.handover?.returnRecord).toEqual(
      returned.agreement.handover?.returnRecord,
    );

    const proposed = proposeSplit(
      returned,
      demoActors.landlord,
      8_000,
      "Repair",
    );
    const declined = declineSplit(proposed, demoActors.tenant);
    const refunded = approveFullRefund(declined, demoActors.landlord);
    repository.save(refunded);
    const reloaded = await repository.load();
    expect(reloaded?.agreement).toMatchObject({
      status: "COMPLETED",
      reservedMinor: 0,
      proposal: null,
    });
    expect(reloaded?.agreement.ledger).toEqual(refunded.agreement.ledger);
  });

  it("reloads an approved equipment split with final totals and no reserved funds", async () => {
    const repository = new LocalDemoRepository();
    const camera = createDemoAgreement(demoActors.landlord, {
      assetType: "EQUIPMENT",
      title: "Camera deposit",
      address: "Budapest pickup point",
      startDate: "2026-11-01",
      endDate: "2026-11-08",
      amountMinor: 30_000,
      terms: "Return the camera and accessories in recorded condition.",
    });
    const returned = returnReviewDemoSnapshot(camera);
    const first = proposeSplit(
      returned,
      demoActors.landlord,
      2_500,
      "Repair quote",
    );
    const revised = proposeSplit(
      declineSplit(first, demoActors.tenant),
      demoActors.landlord,
      2_000,
      "Revised repair quote",
    );
    repository.save(revised);
    const pending = await repository.load();
    expect(pending?.agreement.reservedMinor).toBe(30_000);
    expect(pending?.agreement.proposal).toMatchObject({
      version: 2,
      tenantApproved: false,
    });

    const settled = approveSplit(revised, demoActors.tenant);
    repository.save(settled);
    const reloaded = await repository.load();
    expect(reloaded?.agreement).toMatchObject({
      status: "COMPLETED",
      reservedMinor: 0,
      proposal: {
        version: 2,
        renterRefundMinor: 28_000,
        ownerAllocationMinor: 2_000,
        tenantApproved: true,
      },
    });
    expect(reloaded?.agreement.ledger).toEqual(settled.agreement.ledger);
    expect(reloaded?.agreement.activity).toEqual(settled.agreement.activity);
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
    const funded = fundAgreement(
      acceptTerms(createInitialDemoSnapshot(), demoActors.tenant),
      demoActors.tenant,
    );
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

  it("removes the saved snapshot when reset", async () => {
    const repository = new LocalDemoRepository();
    await repository.save(createInitialDemoSnapshot());

    await repository.reset();

    expect(await repository.load()).toBeNull();
  });

  it("reports a failed write instead of pretending the new state was saved", async () => {
    const repository = new LocalDemoRepository();
    const initial = createInitialDemoSnapshot();
    repository.save(initial);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });

    expect(() =>
      repository.save(acceptTerms(initial, demoActors.tenant)),
    ).toThrow("could not save the demo change");
    expect(await repository.load()).toEqual(initial);
  });

  it("reports a failed reset and keeps the saved agreement", async () => {
    const repository = new LocalDemoRepository();
    const initial = createInitialDemoSnapshot();
    repository.save(initial);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });

    await expect(repository.reset()).rejects.toThrow("could not reset");
    expect(await repository.load()).toEqual(initial);
  });
});
