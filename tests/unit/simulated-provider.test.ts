// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { SimulatedDepositProvider } from "../../src/lib/domain/server/simulated-deposit-provider";

const id = "00000000-0000-0000-0000-000000000001";
const startInput = {
  agreementId: id,
  versionId: id,
  contributionId: id,
  expectedRevision: "0",
  idempotencyKey: "start-1",
};
const agreement = {
  id,
  ownerId: id,
  currency: "EUR",
  state: "awaiting_funding",
  currentVersionId: id,
  revision: "1",
  returnedAt: null,
  inspectionDeadline: null,
};
describe("server-only simulated provider", () => {
  it("uses caller transport for user operations and worker transport for completion/batches", async () => {
    const user = vi
      .fn()
      .mockResolvedValueOnce({
        error: null,
        data: {
          ok: true,
          replayed: false,
          data: {
            agreement,
            operationId: id,
            attemptId: id,
            dueAt: "2026-10-17T00:00:02Z",
          },
        },
      })
      .mockResolvedValueOnce({
        error: null,
        data: {
          ok: true,
          replayed: false,
          data: { agreement, operationId: id },
        },
      });
    const worker = vi
      .fn()
      .mockResolvedValueOnce({
        error: null,
        data: {
          ok: true,
          replayed: false,
          data: {
            agreement,
            operationId: id,
            attemptId: id,
            attemptState: "failed",
          },
        },
      })
      .mockResolvedValueOnce({
        error: null,
        data: {
          ok: true,
          replayed: true,
          data: { jobRunId: id, processedCount: 1, hasMore: false },
        },
      });
    const provider = new SimulatedDepositProvider(user, worker);
    expect(await provider.start(startInput)).toMatchObject({ ok: true });
    expect(user).toHaveBeenCalledWith("start_contribution", {
      p_input: startInput,
    });
    expect(
      await provider.cancel({
        agreementId: id,
        expectedRevision: "1",
        idempotencyKey: "cancel-1",
      }),
    ).toMatchObject({ ok: true });
    expect(user).toHaveBeenLastCalledWith("cancel_agreement", {
      p_input: {
        agreementId: id,
        expectedRevision: "1",
        idempotencyKey: "cancel-1",
      },
    });
    expect(worker).not.toHaveBeenCalled();
    expect(
      await provider.complete({ attemptId: id, idempotencyKey: "done" }),
    ).toMatchObject({ ok: true, data: { attemptState: "failed" } });
    expect(
      await provider.processDue({ batchSize: 10, idempotencyKey: "batch" }),
    ).toMatchObject({ ok: true, replayed: true });
    expect(worker.mock.calls.map((call) => call[0])).toEqual([
      "complete_simulated_contribution",
      "process_due_contributions",
    ]);
    expect(user).toHaveBeenCalledTimes(2);
  });
  it("rejects malformed requests without a database call, including nonnumeric revisions", async () => {
    const rpc = vi.fn();
    const provider = new SimulatedDepositProvider(rpc, rpc);
    for (const expectedRevision of ["abc", "-1", "", "9223372036854775808"]) {
      expect(
        await provider.start({ ...startInput, expectedRevision }),
      ).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    }
    expect(
      await provider.start({
        ...startInput,
        outcome: "succeeded",
      } as typeof startInput),
    ).toMatchObject({ ok: false });
    expect(
      await provider.processDue({ batchSize: 101, idempotencyKey: "bad" }),
    ).toMatchObject({ ok: false });
    expect(
      await provider.cancel({
        agreementId: id,
        expectedRevision: "-1",
        idempotencyKey: "invalid-cancel",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "validation_failed" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("routes settlement approvals to the caller transport and inspection expiry to the worker", async () => {
    const user = vi.fn().mockResolvedValue({
      error: null,
      data: {
        ok: true,
        replayed: false,
        data: { agreement, operationId: id },
      },
    });
    const worker = vi.fn().mockResolvedValue({
      error: null,
      data: {
        ok: true,
        replayed: false,
        data: { jobRunId: id, processedCount: 1, hasMore: false },
      },
    });
    const provider = new SimulatedDepositProvider(user, worker);
    const mutation = {
      agreementId: id,
      expectedRevision: "1",
      idempotencyKey: "settlement-1",
    };
    expect(await provider.approveFullRefund(mutation)).toMatchObject({
      ok: true,
    });
    expect(
      await provider.settle({
        ...mutation,
        kind: "proposal",
        proposalId: id,
      }),
    ).toMatchObject({ ok: true });
    expect(
      await provider.processDueInspections({
        batchSize: 10,
        idempotencyKey: "inspection-1",
      }),
    ).toMatchObject({ ok: true });
    expect(user.mock.calls.map((call) => call[0])).toEqual([
      "approve_full_refund",
      "settle_agreement",
    ]);
    expect(worker.mock.calls.map((call) => call[0])).toEqual([
      "process_due_inspections",
    ]);
    expect(
      await provider.settle({
        ...mutation,
        kind: "proposal",
        proposalId: id,
        caseId: id,
      } as typeof mutation & {
        kind: "proposal";
        proposalId: string;
        caseId: string;
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "validation_failed" },
    });
    expect(user).toHaveBeenCalledTimes(2);
  });
  it("returns safe errors without exposing database or transport internals", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { message: "private SQL credentials" },
      })
      .mockRejectedValueOnce(new Error("private transport failure"))
      .mockResolvedValueOnce({
        data: { ok: true, data: "invalid" },
        error: null,
      });
    const provider = new SimulatedDepositProvider(rpc, rpc);
    for (let n = 0; n < 3; n++)
      expect(await provider.start(startInput)).toEqual({
        ok: false,
        error: {
          code: "temporarily_unavailable",
          message: "Funding is temporarily unavailable.",
          retryable: true,
        },
      });
  });
  it("preserves recoverable domain errors and replayed responses", async () => {
    const data = {
      ok: false,
      error: {
        code: "idempotency_conflict",
        message: "idempotency conflict",
        retryable: false,
      },
    };
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    expect(
      await new SimulatedDepositProvider(rpc, rpc).start(startInput),
    ).toEqual(data);
  });
});
