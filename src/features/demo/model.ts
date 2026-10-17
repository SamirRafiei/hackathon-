import { z } from "zod";
import {
  contractSchema,
  type AgreementContract,
} from "@/features/agreements/contracts/model";
import { DEMO_AGREEMENT_PRESETS } from "./agreement-presets";
import type {
  BaselineRecord,
  ReturnRecord,
  ArrivalRecord,
} from "@/features/handover/contracts";
import {
  baselineRecordSchema,
  returnRecordSchema,
  arrivalRecordSchema,
  handoverStateSchema,
  emptyHandoverState,
  type HandoverState,
} from "@/features/handover/record-schema";
import { demoActors, type PactActor } from "@/lib/auth/identity-provider";

export const DEMO_AMOUNT_MINOR = 100_000;
export const DEMO_CURRENCY = "EUR";

export type AgreementStatus =
  | "AWAITING_ACCEPTANCE"
  | "AWAITING_BASELINE"
  | "AWAITING_FUNDING"
  | "FUNDED"
  | "ACTIVE"
  | "RETURN_REVIEW"
  | "PROPOSAL_PENDING"
  | "COMPLETED";

export type LedgerEntry = {
  id: string;
  operationId: string;
  account:
    | "renter_available"
    | "agreement_reserved"
    | "renter_refund"
    | "landlord_allocation";
  amountMinor: number;
  currency: typeof DEMO_CURRENCY;
  createdAt: string;
};

export type ActivityEvent = {
  id: string;
  actorName: string;
  description: string;
  createdAt: string;
};

export type SettlementProposal = {
  version: number;
  ownerAllocationMinor: number;
  renterRefundMinor: number;
  reason: string;
  landlordApproved: true;
  tenantApproved: boolean;
};

export type DemoAgreement = {
  id: string;
  assetType: "APARTMENT" | "EQUIPMENT";
  title: string;
  address: string;
  terms: string;
  startDate: string;
  endDate: string;
  termsVersion: number;
  contract?: AgreementContract;
  amountMinor: number;
  currency: typeof DEMO_CURRENCY;
  status: AgreementStatus;
  acceptedBy: Record<"landlord" | "tenant", boolean>;
  reservedMinor: number;
  proposal: SettlementProposal | null;
  ledger: LedgerEntry[];
  activity: ActivityEvent[];
  handover?: HandoverState;
};

export type DemoSnapshot = {
  activeActorId: "demo-landlord" | "demo-tenant";
  setupPending?: boolean;
  agreement: DemoAgreement;
};

const entrySchema = z.object({
  id: z.string(),
  operationId: z.string(),
  account: z.enum([
    "renter_available",
    "agreement_reserved",
    "renter_refund",
    "landlord_allocation",
  ]),
  amountMinor: z.number().safe().int(),
  currency: z.literal(DEMO_CURRENCY),
  createdAt: z.string(),
});

const activitySchema = z.object({
  id: z.string(),
  actorName: z.string(),
  description: z.string(),
  createdAt: z.string(),
});

const proposalSchema = z.object({
  version: z.number().int().positive(),
  ownerAllocationMinor: z.number().int().nonnegative(),
  renterRefundMinor: z.number().int().nonnegative(),
  reason: z.string(),
  landlordApproved: z.literal(true),
  tenantApproved: z.boolean(),
});

export const demoSnapshotSchema = z
  .object({
    activeActorId: z.enum(["demo-landlord", "demo-tenant"]),
    setupPending: z.boolean().optional(),
    agreement: z.object({
      id: z.string(),
      assetType: z.enum(["APARTMENT", "EQUIPMENT"]).default("APARTMENT"),
      title: z.string().max(120),
      address: z.string().max(240),
      terms: z
        .string()
        .max(20000)
        .default(
          "Both parties agree to the stated rental dates, condition checklist, and 48-hour return review. Any deduction requires mutual agreement.",
        ),
      startDate: z.string(),
      endDate: z.string(),
      termsVersion: z.number().int().positive(),
      contract: contractSchema.optional(),
      amountMinor: z.number().safe().int().positive(),
      currency: z.literal(DEMO_CURRENCY),
      status: z.enum([
        "AWAITING_ACCEPTANCE",
        "AWAITING_BASELINE",
        "AWAITING_FUNDING",
        "FUNDED",
        "ACTIVE",
        "RETURN_REVIEW",
        "PROPOSAL_PENDING",
        "COMPLETED",
      ]),
      acceptedBy: z.object({ landlord: z.boolean(), tenant: z.boolean() }),
      reservedMinor: z.number().safe().int().nonnegative(),
      proposal: proposalSchema.nullable(),
      ledger: z.array(entrySchema),
      activity: z.array(activitySchema),
      handover: handoverStateSchema.optional(),
    }),
  })
  .superRefine(({ agreement }, context) => {
    const { amountMinor, reservedMinor, status, acceptedBy, proposal, ledger } =
      agreement;

    if (reservedMinor > amountMinor) {
      context.addIssue({
        code: "custom",
        path: ["agreement", "reservedMinor"],
        message: "Reserved funds cannot exceed the agreement amount.",
      });
    }

    const operationTotals = new Map<string, number>();
    const accountTotals = new Map<LedgerEntry["account"], number>();
    let reservedLedgerBalance = 0;
    let ledgerTotal = 0;
    for (const entry of ledger) {
      operationTotals.set(
        entry.operationId,
        (operationTotals.get(entry.operationId) ?? 0) + entry.amountMinor,
      );
      accountTotals.set(
        entry.account,
        (accountTotals.get(entry.account) ?? 0) + entry.amountMinor,
      );
      ledgerTotal += entry.amountMinor;
      if (entry.account === "agreement_reserved") {
        reservedLedgerBalance += entry.amountMinor;
      }
    }

    if (
      ledgerTotal !== 0 ||
      [...operationTotals.values()].some((total) => total !== 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["agreement", "ledger"],
        message: "Ledger entries must balance overall and per operation.",
      });
    }
    if (reservedLedgerBalance !== reservedMinor) {
      context.addIssue({
        code: "custom",
        path: ["agreement", "reservedMinor"],
        message: "Reserved funds must match the ledger balance.",
      });
    }

    const hasFunding = [
      "FUNDED",
      "ACTIVE",
      "RETURN_REVIEW",
      "PROPOSAL_PENDING",
      "COMPLETED",
    ].includes(status);
    const tenantAvailableTotal = accountTotals.get("renter_available") ?? 0;
    const refundTotal = accountTotals.get("renter_refund") ?? 0;
    const ownerAllocationTotal = accountTotals.get("landlord_allocation") ?? 0;
    if (
      (hasFunding && tenantAvailableTotal !== -amountMinor) ||
      (!hasFunding && tenantAvailableTotal !== 0) ||
      refundTotal < 0 ||
      ownerAllocationTotal < 0 ||
      refundTotal + ownerAllocationTotal + reservedMinor !==
        (hasFunding ? amountMinor : 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["agreement", "ledger"],
        message: "Ledger account totals do not match the agreement lifecycle.",
      });
    }

    if (
      ["AWAITING_BASELINE", "AWAITING_FUNDING"].includes(status) &&
      !(acceptedBy.landlord && acceptedBy.tenant)
    ) {
      context.addIssue({
        code: "custom",
        path: ["agreement", "acceptedBy"],
        message: "Both parties must accept before funding.",
      });
    }

    if (
      [
        "FUNDED",
        "ACTIVE",
        "RETURN_REVIEW",
        "PROPOSAL_PENDING",
        "COMPLETED",
      ].includes(status) &&
      !(acceptedBy.landlord && acceptedBy.tenant)
    ) {
      context.addIssue({
        code: "custom",
        path: ["agreement", "acceptedBy"],
        message: "A funded agreement must have both parties' acceptance.",
      });
    }

    if (
      ["FUNDED", "ACTIVE", "RETURN_REVIEW", "PROPOSAL_PENDING"].includes(
        status,
      ) &&
      reservedMinor === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["agreement", "reservedMinor"],
        message: "An unsettled funded agreement must have reserved funds.",
      });
    }

    if (
      status === "PROPOSAL_PENDING" &&
      (!proposal || proposal.tenantApproved)
    ) {
      context.addIssue({
        code: "custom",
        path: ["agreement", "proposal"],
        message: "A pending proposal must await tenant approval.",
      });
    }

    if (status === "COMPLETED" && reservedMinor !== 0) {
      context.addIssue({
        code: "custom",
        path: ["agreement", "reservedMinor"],
        message: "A completed agreement cannot retain reserved funds.",
      });
    }

    if (proposal) {
      const expectedTotal =
        status === "COMPLETED" ? amountMinor : reservedMinor;
      if (
        proposal.ownerAllocationMinor + proposal.renterRefundMinor !==
        expectedTotal
      ) {
        context.addIssue({
          code: "custom",
          path: ["agreement", "proposal"],
          message: "Proposal allocations must equal the amount being settled.",
        });
      }
      if (status === "COMPLETED" && !proposal.tenantApproved) {
        context.addIssue({
          code: "custom",
          path: ["agreement", "proposal", "tenantApproved"],
          message: "A split can only be completed after tenant approval.",
        });
      }
    }
  });

const fixtureTime = "2026-10-17T09:00:00.000Z";

export function createInitialDemoSnapshot(): DemoSnapshot {
  return {
    activeActorId: demoActors.tenant.id,
    agreement: {
      id: "demo-apartment-agreement",
      ...DEMO_AGREEMENT_PRESETS.APARTMENT,
      termsVersion: 1,
      amountMinor: DEMO_AMOUNT_MINOR,
      currency: DEMO_CURRENCY,
      status: "AWAITING_ACCEPTANCE",
      acceptedBy: { landlord: true, tenant: false },
      reservedMinor: 0,
      proposal: null,
      ledger: [],
      activity: [
        {
          id: "fixture-created",
          actorName: demoActors.landlord.displayName,
          description: "Created the agreement and shared version 1.0",
          createdAt: fixtureTime,
        },
        {
          id: "fixture-landlord-accepted",
          actorName: demoActors.landlord.displayName,
          description: "Accepted the current terms",
          createdAt: fixtureTime,
        },
      ],
    },
  };
}

export function createDemoSetupSnapshot(): DemoSnapshot {
  return {
    ...createInitialDemoSnapshot(),
    activeActorId: demoActors.landlord.id,
    setupPending: true,
  };
}

export function actorForId(id: DemoSnapshot["activeActorId"]): PactActor {
  return id === demoActors.landlord.id
    ? demoActors.landlord
    : demoActors.tenant;
}

export type DemoAgreementInput = {
  assetType: DemoAgreement["assetType"];
  title: string;
  address: string;
  startDate: string;
  endDate: string;
  amountMinor: number;
  terms: string;
  contract: AgreementContract;
};

const agreementInputSchema = z
  .object({
    assetType: z.enum(["APARTMENT", "EQUIPMENT"]),
    contract: contractSchema,
    title: z.string().trim().min(1, "Add a name for this agreement.").max(120),
    address: z.string().trim().min(1, "Add the rental location.").max(240),
    startDate: z.iso.date({ error: "Enter a valid rental start date." }),
    endDate: z.iso.date({ error: "Enter a valid rental end date." }),
    amountMinor: z
      .number()
      .int("Enter a deposit in whole cents.")
      .min(100, "The deposit must be at least €1.")
      .max(100_000_000, "The deposit cannot exceed €1,000,000."),
    terms: z.string().trim().min(10, "Add the agreement terms.").max(20000),
  })
  .refine((value) => value.endDate > value.startDate, {
    path: ["endDate"],
    message: "The end date must be after the start date.",
  });

/** Parse entered euros without rounding away fractional cents. */
export function parseDemoDepositAmount(value: string): number {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(
      "Enter a deposit from €1 to €1,000,000 with up to two decimal places.",
    );
  }
  const [whole, fraction = ""] = normalized.split(".");
  const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 100 ||
    amountMinor > 100_000_000
  ) {
    throw new Error(
      "Enter a deposit from €1 to €1,000,000 with up to two decimal places.",
    );
  }
  return amountMinor;
}

export function validateDemoAgreementInput(
  input: DemoAgreementInput,
): DemoAgreementInput {
  if (!input.contract)
    throw new Error("Attach a contract PDF before creating the agreement.");
  const parsed = agreementInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Check the agreement details.",
    );
  }
  if (
    parsed.data.contract.source === "demo-preset" &&
    parsed.data.contract.assetType !== parsed.data.assetType
  ) {
    throw new Error("Choose a demo contract matching the rental type.");
  }
  return parsed.data;
}

export function createDemoAgreement(
  actor: PactActor,
  input: DemoAgreementInput,
): DemoSnapshot {
  requireRole(actor, "landlord");
  const values = validateDemoAgreementInput(input);
  const now = new Date().toISOString();
  return {
    activeActorId: actor.id as DemoSnapshot["activeActorId"],
    agreement: {
      id: newId("demo-agreement"),
      assetType: values.assetType,
      title: values.title,
      address: values.address,
      terms: values.terms,
      contract: values.contract,
      startDate: values.startDate,
      endDate: values.endDate,
      termsVersion: 1,
      amountMinor: values.amountMinor,
      currency: DEMO_CURRENCY,
      status: "AWAITING_ACCEPTANCE",
      acceptedBy: { landlord: true, tenant: false },
      reservedMinor: 0,
      proposal: null,
      ledger: [],
      activity: [
        {
          id: newId("event"),
          actorName: actor.displayName,
          description: "Created version 1 and accepted the proposed terms",
          createdAt: now,
        },
      ],
    },
  };
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function recordActivity(
  agreement: DemoAgreement,
  actor: PactActor,
  description: string,
): DemoAgreement {
  return {
    ...agreement,
    activity: [
      {
        id: newId("event"),
        actorName: actor.displayName,
        description,
        createdAt: new Date().toISOString(),
      },
      ...agreement.activity,
    ],
  };
}

function requireRole(actor: PactActor, role: PactActor["role"]) {
  if (actor.role !== role) {
    throw new Error(`Switch to the ${role} demo identity to do this.`);
  }
}

export function acceptTerms(
  snapshot: DemoSnapshot,
  actor: PactActor,
): DemoSnapshot {
  if (snapshot.agreement.status !== "AWAITING_ACCEPTANCE") {
    throw new Error("These terms are no longer awaiting acceptance.");
  }
  requireRole(actor, "tenant");
  if (snapshot.setupPending)
    throw new Error("The landlord must create the agreement first.");
  if (snapshot.agreement.acceptedBy.tenant) {
    throw new Error("You have already accepted this version.");
  }
  const acceptedBy = { ...snapshot.agreement.acceptedBy, [actor.role]: true };
  let agreement: DemoAgreement = { ...snapshot.agreement, acceptedBy };
  agreement = recordActivity(
    agreement,
    actor,
    `Accepted agreement version ${agreement.termsVersion}.0`,
  );
  if (acceptedBy.landlord && acceptedBy.tenant) {
    agreement = { ...agreement, status: "AWAITING_BASELINE" };
  }
  return { ...snapshot, agreement };
}

export function fundAgreement(
  snapshot: DemoSnapshot,
  actor: PactActor,
): DemoSnapshot {
  requireRole(actor, "tenant");
  if (
    !snapshot.agreement.acceptedBy.landlord ||
    !snapshot.agreement.acceptedBy.tenant
  ) {
    throw new Error("Both parties must accept before funding.");
  }
  if (
    !["AWAITING_BASELINE", "AWAITING_FUNDING"].includes(
      snapshot.agreement.status,
    )
  ) {
    throw new Error("This agreement is no longer awaiting funding.");
  }
  const baseline = snapshot.agreement.handover?.baseline;
  if (
    snapshot.agreement.status !== "AWAITING_FUNDING" ||
    !baseline ||
    baseline.agreementId !== snapshot.agreement.id ||
    baseline.termsVersion !== snapshot.agreement.termsVersion ||
    baseline.assetType !== snapshot.agreement.assetType ||
    !baseline.acknowledgedBy[demoActors.landlord.id] ||
    !baseline.acknowledgedBy[demoActors.tenant.id]
  )
    throw new Error(
      "Review and acknowledge the current condition baseline before funding.",
    );
  const operationId = newId("fund");
  const now = new Date().toISOString();
  const entries: LedgerEntry[] = [
    {
      id: newId("entry"),
      operationId,
      account: "renter_available",
      amountMinor: -snapshot.agreement.amountMinor,
      currency: DEMO_CURRENCY,
      createdAt: now,
    },
    {
      id: newId("entry"),
      operationId,
      account: "agreement_reserved",
      amountMinor: snapshot.agreement.amountMinor,
      currency: DEMO_CURRENCY,
      createdAt: now,
    },
  ];
  let agreement: DemoAgreement = {
    ...snapshot.agreement,
    status: "ACTIVE",
    reservedMinor: snapshot.agreement.amountMinor,
    ledger: [...snapshot.agreement.ledger, ...entries],
  };
  agreement = recordActivity(
    agreement,
    actor,
    "Simulated the deposit funding after baseline approval; rental activated",
  );
  return { ...snapshot, agreement };
}

/** Browser-demo transition only; a server repository must authorize and timestamp independently. */
export function recordBaseline(
  snapshot: DemoSnapshot,
  actor: PactActor,
  input: BaselineRecord,
): DemoSnapshot {
  if (
    !["AWAITING_BASELINE", "AWAITING_FUNDING", "FUNDED"].includes(
      snapshot.agreement.status,
    ) ||
    !snapshot.agreement.acceptedBy.landlord ||
    !snapshot.agreement.acceptedBy.tenant
  )
    throw new Error(
      "Baseline changes require accepted terms and an agreement awaiting activation.",
    );
  const baseline = baselineRecordSchema.parse(input);
  const current = snapshot.agreement.handover?.baseline;
  if (
    baseline.agreementId !== snapshot.agreement.id ||
    baseline.termsVersion !== snapshot.agreement.termsVersion ||
    baseline.assetType !== snapshot.agreement.assetType
  )
    throw new Error(
      "The baseline does not match the current agreement version.",
    );
  if (actor.id !== demoActors.landlord.id && actor.id !== demoActors.tenant.id)
    throw new Error("Only agreement participants can acknowledge a baseline.");
  if (
    !baseline.evidence.some((file) => file.mimeType.startsWith("image/")) ||
    baseline.evidence.some(
      (file) =>
        file.phase !== "baseline" ||
        file.agreementId !== baseline.agreementId ||
        !file.submittedAt,
    )
  )
    throw new Error("A submitted baseline photograph is required.");
  const allowedIds = [demoActors.landlord.id, demoActors.tenant.id] as string[];
  if (
    Object.keys(baseline.acknowledgedBy).some((id) => !allowedIds.includes(id))
  )
    throw new Error("Unknown baseline acknowledgment.");
  if (
    !current ||
    baseline.id !== current.id ||
    baseline.version !== current.version
  ) {
    requireRole(actor, "landlord");
    if (
      baseline.version !== (current?.version ?? 0) + 1 ||
      !baseline.acknowledgedBy[actor.id] ||
      Object.keys(baseline.acknowledgedBy).length !== 1
    )
      throw new Error(
        "A new baseline must reset consent and be acknowledged by its owner.",
      );
  } else {
    const content = (record: BaselineRecord) =>
      JSON.stringify({ ...record, acknowledgedBy: {} });
    if (content(baseline) !== content(current))
      throw new Error(
        "Published baseline content is immutable; publish a revision instead.",
      );
    const expected = {
      ...current.acknowledgedBy,
      [actor.id]: baseline.acknowledgedBy[actor.id],
    };
    if (
      !expected[actor.id] ||
      JSON.stringify(expected) !== JSON.stringify(baseline.acknowledgedBy)
    )
      throw new Error("Each party must acknowledge for themselves.");
  }
  const ready = Boolean(
    baseline.acknowledgedBy[demoActors.landlord.id] &&
    baseline.acknowledgedBy[demoActors.tenant.id],
  );
  let agreement: DemoAgreement = {
    ...snapshot.agreement,
    // FUNDED is retained for saves from the earlier funding-first demo.
    status:
      snapshot.agreement.status === "FUNDED"
        ? ready
          ? "ACTIVE"
          : "FUNDED"
        : "AWAITING_FUNDING",
    handover: {
      ...(snapshot.agreement.handover ?? emptyHandoverState()),
      baseline,
    },
  };
  agreement = recordActivity(
    agreement,
    actor,
    ready
      ? snapshot.agreement.status === "FUNDED"
        ? "Both parties acknowledged the same condition baseline; rental activated"
        : "Both parties acknowledged the same condition baseline; ready for tenant funding"
      : `Published or acknowledged condition baseline version ${baseline.version}`,
  );
  return { ...snapshot, agreement };
}

export function recordArrivalInspection(
  snapshot: DemoSnapshot,
  actor: PactActor,
  input: ArrivalRecord,
): DemoSnapshot {
  requireRole(actor, "tenant");
  if (
    actor.id !== demoActors.tenant.id ||
    !["FUNDED", "ACTIVE"].includes(snapshot.agreement.status)
  )
    throw new Error(
      "Only the renter can record an arrival inspection after funding.",
    );
  if (snapshot.agreement.assetType !== "APARTMENT")
    throw new Error("Arrival inspection applies to apartments.");
  const record = arrivalRecordSchema.parse(input);
  if (
    record.agreementId !== snapshot.agreement.id ||
    record.submittedBy !== actor.id ||
    snapshot.agreement.handover?.arrivalRecord
  )
    throw new Error("Arrival inspection is unrelated or already submitted.");
  if (
    record.evidence.some(
      (file) =>
        file.agreementId !== record.agreementId ||
        file.phase !== "arrival" ||
        !file.submittedAt,
    )
  )
    throw new Error("Arrival evidence must be finalized for this agreement.");
  let agreement: DemoAgreement = {
    ...snapshot.agreement,
    handover: {
      ...(snapshot.agreement.handover ?? emptyHandoverState()),
      arrivalRecord: record,
    },
  };
  agreement = recordActivity(
    agreement,
    actor,
    "Recorded arrival inspection; no funds were released",
  );
  return { ...snapshot, agreement };
}

export function submitReturn(
  snapshot: DemoSnapshot,
  actor: PactActor,
  input?: ReturnRecord,
): DemoSnapshot {
  requireRole(actor, "tenant");
  if (!["FUNDED", "ACTIVE"].includes(snapshot.agreement.status))
    throw new Error(
      "The agreement must be funded before return can be recorded.",
    );
  const baseline = snapshot.agreement.handover?.baseline;
  if (
    snapshot.agreement.status !== "ACTIVE" ||
    !baseline ||
    !baseline.acknowledgedBy[demoActors.landlord.id] ||
    !baseline.acknowledgedBy[demoActors.tenant.id]
  )
    throw new Error(
      "Both parties must acknowledge the baseline before return.",
    );
  if (!input)
    throw new Error("Return photographs and a declaration are required.");
  const record = returnRecordSchema.parse(input);
  if (
    snapshot.agreement.handover?.returnRecord ||
    record.agreementId !== snapshot.agreement.id ||
    record.submittedBy !== actor.id ||
    record.baselineId !== baseline.id ||
    record.baselineVersion !== baseline.version ||
    actor.id !== demoActors.tenant.id
  )
    throw new Error(
      "The return does not match this active baseline or was already submitted.",
    );
  if (
    Date.parse(record.inspectionDeadline) - Date.parse(record.submittedAt) !==
    48 * 60 * 60 * 1000
  )
    throw new Error(
      "The first return declaration starts exactly one 48-hour review window.",
    );
  if (
    !record.evidence.some((file) => file.mimeType.startsWith("image/")) ||
    record.evidence.some(
      (file) =>
        file.agreementId !== record.agreementId ||
        file.phase !== "return" ||
        !file.submittedAt,
    )
  )
    throw new Error("Submitted return photographs are required.");
  let agreement: DemoAgreement = {
    ...snapshot.agreement,
    status: "RETURN_REVIEW",
    handover: {
      ...(snapshot.agreement.handover ?? emptyHandoverState()),
      returnRecord: record,
    },
  };
  agreement = recordActivity(
    agreement,
    actor,
    "Recorded the rental return and fixed the 48-hour review deadline",
  );
  return { ...snapshot, agreement };
}

export function proposeSplit(
  snapshot: DemoSnapshot,
  actor: PactActor,
  ownerAllocationMinor: number,
  reason: string,
): DemoSnapshot {
  requireRole(actor, "landlord");
  const current = snapshot.agreement;
  if (
    current.status !== "RETURN_REVIEW" &&
    current.status !== "PROPOSAL_PENDING"
  ) {
    throw new Error("A split can only be proposed during return review.");
  }
  if (
    !Number.isSafeInteger(ownerAllocationMinor) ||
    ownerAllocationMinor < 0 ||
    ownerAllocationMinor > current.reservedMinor
  ) {
    throw new Error(
      "The proposed allocation must be between €0 and the reserved amount.",
    );
  }
  const normalizedReason = reason.trim();
  if (!normalizedReason)
    throw new Error("Add a short reason for the proposed split.");
  const version = (current.proposal?.version ?? 0) + 1;
  const proposal: SettlementProposal = {
    version,
    ownerAllocationMinor,
    renterRefundMinor: current.reservedMinor - ownerAllocationMinor,
    reason: normalizedReason,
    landlordApproved: true,
    tenantApproved: false,
  };
  let agreement: DemoAgreement = {
    ...current,
    status: "PROPOSAL_PENDING",
    proposal,
  };
  agreement = recordActivity(
    agreement,
    actor,
    `Proposed version ${version}: ${formatMoney(proposal.renterRefundMinor)} refund and ${formatMoney(proposal.ownerAllocationMinor)} landlord allocation`,
  );
  return { ...snapshot, agreement };
}

export function approveSplit(
  snapshot: DemoSnapshot,
  actor: PactActor,
): DemoSnapshot {
  requireRole(actor, "tenant");
  const current = snapshot.agreement;
  if (current.status !== "PROPOSAL_PENDING" || !current.proposal) {
    throw new Error("There is no open split proposal to approve.");
  }
  const proposal = { ...current.proposal, tenantApproved: true };
  const operationId = newId("settle-v");
  const now = new Date().toISOString();
  const entries: LedgerEntry[] = [
    {
      id: newId("entry"),
      operationId,
      account: "agreement_reserved",
      amountMinor: -current.reservedMinor,
      currency: DEMO_CURRENCY,
      createdAt: now,
    },
    {
      id: newId("entry"),
      operationId,
      account: "renter_refund",
      amountMinor: proposal.renterRefundMinor,
      currency: DEMO_CURRENCY,
      createdAt: now,
    },
    {
      id: newId("entry"),
      operationId,
      account: "landlord_allocation",
      amountMinor: proposal.ownerAllocationMinor,
      currency: DEMO_CURRENCY,
      createdAt: now,
    },
  ];
  let agreement: DemoAgreement = {
    ...current,
    status: "COMPLETED",
    reservedMinor: 0,
    proposal,
    ledger: [...current.ledger, ...entries],
  };
  agreement = recordActivity(
    agreement,
    actor,
    `Approved split version ${proposal.version}; simulated settlement completed`,
  );
  return { ...snapshot, agreement };
}

export function declineSplit(
  snapshot: DemoSnapshot,
  actor: PactActor,
): DemoSnapshot {
  requireRole(actor, "tenant");
  if (snapshot.agreement.status !== "PROPOSAL_PENDING") {
    throw new Error("There is no open split proposal to decline.");
  }
  let agreement: DemoAgreement = {
    ...snapshot.agreement,
    status: "RETURN_REVIEW",
  };
  agreement = recordActivity(
    agreement,
    actor,
    "Asked the landlord to revise the proposal; funds remain reserved",
  );
  return { ...snapshot, agreement };
}

export function approveFullRefund(
  snapshot: DemoSnapshot,
  actor: PactActor,
): DemoSnapshot {
  requireRole(actor, "landlord");
  const current = snapshot.agreement;
  if (current.status !== "RETURN_REVIEW") {
    throw new Error("A full refund can only be approved during return review.");
  }
  const operationId = newId("refund");
  const now = new Date().toISOString();
  const entries: LedgerEntry[] = [
    {
      id: newId("entry"),
      operationId,
      account: "agreement_reserved",
      amountMinor: -current.reservedMinor,
      currency: DEMO_CURRENCY,
      createdAt: now,
    },
    {
      id: newId("entry"),
      operationId,
      account: "renter_refund",
      amountMinor: current.reservedMinor,
      currency: DEMO_CURRENCY,
      createdAt: now,
    },
  ];
  let agreement: DemoAgreement = {
    ...current,
    status: "COMPLETED",
    reservedMinor: 0,
    ledger: [...current.ledger, ...entries],
  };
  agreement = recordActivity(
    agreement,
    actor,
    "Approved the full renter refund; simulated settlement completed",
  );
  return { ...snapshot, agreement };
}

export function formatMoney(amountMinor: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: DEMO_CURRENCY,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}
