import { z } from "zod";
import { demoActors, type PactActor } from "@/lib/auth/identity-provider";

export const DEMO_AMOUNT_MINOR = 100_000;
export const DEMO_CURRENCY = "EUR";

export type AgreementStatus =
  | "AWAITING_ACCEPTANCE"
  | "AWAITING_FUNDING"
  | "FUNDED"
  | "RETURN_REVIEW"
  | "PROPOSAL_PENDING"
  | "COMPLETED";

export type LedgerEntry = {
  id: string;
  operationId: string;
  account: "renter_available" | "agreement_reserved" | "renter_refund" | "landlord_allocation";
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
  title: string;
  address: string;
  startDate: string;
  endDate: string;
  termsVersion: number;
  amountMinor: number;
  currency: typeof DEMO_CURRENCY;
  status: AgreementStatus;
  acceptedBy: Record<"landlord" | "tenant", boolean>;
  reservedMinor: number;
  proposal: SettlementProposal | null;
  ledger: LedgerEntry[];
  activity: ActivityEvent[];
};

export type DemoSnapshot = {
  activeActorId: "demo-landlord" | "demo-tenant";
  agreement: DemoAgreement;
};

const entrySchema = z.object({
  id: z.string(),
  operationId: z.string(),
  account: z.enum(["renter_available", "agreement_reserved", "renter_refund", "landlord_allocation"]),
  amountMinor: z.number().int(),
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

export const demoSnapshotSchema = z.object({
  activeActorId: z.enum(["demo-landlord", "demo-tenant"]),
  agreement: z.object({
    id: z.string(),
    title: z.string(),
    address: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    termsVersion: z.number().int().positive(),
    amountMinor: z.number().int().positive(),
    currency: z.literal(DEMO_CURRENCY),
    status: z.enum([
      "AWAITING_ACCEPTANCE",
      "AWAITING_FUNDING",
      "FUNDED",
      "RETURN_REVIEW",
      "PROPOSAL_PENDING",
      "COMPLETED",
    ]),
    acceptedBy: z.object({ landlord: z.boolean(), tenant: z.boolean() }),
    reservedMinor: z.number().int().nonnegative(),
    proposal: proposalSchema.nullable(),
    ledger: z.array(entrySchema),
    activity: z.array(activitySchema),
  }),
});

const fixtureTime = "2026-10-17T09:00:00.000Z";

export function createInitialDemoSnapshot(): DemoSnapshot {
  return {
    activeActorId: demoActors.tenant.id,
    agreement: {
      id: "demo-apartment-agreement",
      title: "Apartment security deposit",
      address: "18 Kertész utca, Budapest",
      startDate: "2026-09-01",
      endDate: "2027-08-31",
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

export function actorForId(id: DemoSnapshot["activeActorId"]): PactActor {
  return id === demoActors.landlord.id ? demoActors.landlord : demoActors.tenant;
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

export function acceptTerms(snapshot: DemoSnapshot, actor: PactActor): DemoSnapshot {
  if (snapshot.agreement.status !== "AWAITING_ACCEPTANCE") {
    throw new Error("These terms are no longer awaiting acceptance.");
  }
  const acceptedBy = { ...snapshot.agreement.acceptedBy, [actor.role]: true };
  let agreement: DemoAgreement = { ...snapshot.agreement, acceptedBy };
  agreement = recordActivity(agreement, actor, "Accepted agreement version 1.0");
  if (acceptedBy.landlord && acceptedBy.tenant) {
    agreement = { ...agreement, status: "AWAITING_FUNDING" };
  }
  return { ...snapshot, agreement };
}

export function fundAgreement(snapshot: DemoSnapshot, actor: PactActor): DemoSnapshot {
  requireRole(actor, "tenant");
  if (snapshot.agreement.status !== "AWAITING_FUNDING") {
    throw new Error("Both parties must accept before funding.");
  }
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
    status: "FUNDED",
    reservedMinor: snapshot.agreement.amountMinor,
    ledger: [...snapshot.agreement.ledger, ...entries],
  };
  agreement = recordActivity(agreement, actor, "Simulated the deposit funding; funds are reserved in the demo ledger");
  return { ...snapshot, agreement };
}

export function submitReturn(snapshot: DemoSnapshot, actor: PactActor): DemoSnapshot {
  requireRole(actor, "tenant");
  if (snapshot.agreement.status !== "FUNDED") {
    throw new Error("The agreement must be funded before return can be recorded.");
  }
  let agreement: DemoAgreement = { ...snapshot.agreement, status: "RETURN_REVIEW" };
  agreement = recordActivity(agreement, actor, "Recorded the apartment return and started the review");
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
  if (current.status !== "RETURN_REVIEW" && current.status !== "PROPOSAL_PENDING") {
    throw new Error("A split can only be proposed during return review.");
  }
  if (!Number.isSafeInteger(ownerAllocationMinor) || ownerAllocationMinor < 0 || ownerAllocationMinor > current.reservedMinor) {
    throw new Error("The proposed allocation must be between €0 and the reserved amount.");
  }
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error("Add a short reason for the proposed split.");
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

export function approveSplit(snapshot: DemoSnapshot, actor: PactActor): DemoSnapshot {
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
  agreement = recordActivity(agreement, actor, `Approved split version ${proposal.version}; simulated settlement completed`);
  return { ...snapshot, agreement };
}

export function declineSplit(snapshot: DemoSnapshot, actor: PactActor): DemoSnapshot {
  requireRole(actor, "tenant");
  if (snapshot.agreement.status !== "PROPOSAL_PENDING") {
    throw new Error("There is no open split proposal to decline.");
  }
  let agreement: DemoAgreement = {
    ...snapshot.agreement,
    status: "RETURN_REVIEW",
    proposal: null,
  };
  agreement = recordActivity(agreement, actor, "Asked the landlord to revise the proposal; funds remain reserved");
  return { ...snapshot, agreement };
}

export function approveFullRefund(snapshot: DemoSnapshot, actor: PactActor): DemoSnapshot {
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
  agreement = recordActivity(agreement, actor, "Approved the full renter refund; simulated settlement completed");
  return { ...snapshot, agreement };
}

export function formatMoney(amountMinor: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: DEMO_CURRENCY,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}
