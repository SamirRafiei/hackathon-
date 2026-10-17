import { describe, expect, it, beforeEach } from "vitest";
import { LocalDemoRepository } from "@/features/demo/repository";
import { createInitialDemoSnapshot } from "@/features/demo/model";

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

  it("removes the saved snapshot when reset", async () => {
    const repository = new LocalDemoRepository();
    await repository.save(createInitialDemoSnapshot());

    await repository.reset();

    expect(await repository.load()).toBeNull();
  });
});
