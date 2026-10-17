"use client";

import { useMemo, useState } from "react";
import type { DemoAgreement } from "@/features/demo/model";
import type { PactActor } from "@/lib/auth/identity-provider";
import { demoActors } from "@/lib/auth/identity-provider";
import type {
  ArrivalRecord,
  BaselineRecord,
  ReturnRecord,
  HandoverActor,
} from "./contracts";
import { emptyHandoverState } from "./record-schema";
import { BrowserDemoEvidenceStorage } from "./evidence/storage";
import { BaselinePanel } from "./baseline/baseline-panel";
import { ReturnPanel } from "./returns/return-panel";
import { EvidenceComparison } from "./comparison/evidence-comparison";
import { ArrivalInspectionPanel } from "./arrival/arrival-inspection-panel";

export type HandoverWorkspaceProps = {
  agreement: DemoAgreement;
  actor: PactActor;
  onBaselineChange: (record: BaselineRecord) => void;
  onSubmitReturn: (record: ReturnRecord) => void;
  onSubmitInspection: (record: ArrivalRecord) => void;
};

export function HandoverWorkspace(props: HandoverWorkspaceProps) {
  const storage = useMemo(() => new BrowserDemoEvidenceStorage(), []);
  const [tab, setTab] = useState("baseline");
  const { agreement, actor } = props;
  const state = agreement.handover ?? emptyHandoverState();
  const conditionAvailable = [
    "AWAITING_BASELINE",
    "AWAITING_FUNDING",
    "FUNDED",
    "ACTIVE",
    "RETURN_REVIEW",
    "PROPOSAL_PENDING",
    "COMPLETED",
  ].includes(agreement.status);
  const handoverActor: HandoverActor = {
    id: actor.id,
    displayName: actor.displayName,
    role: actor.role === "landlord" ? "owner" : "renter",
  };
  const participants = {
    ownerId: demoActors.landlord.id,
    renterId: demoActors.tenant.id,
  };
  const tabs = [
    ["baseline", "Initial condition"],
    ["return", "Return declaration"],
    ["comparison", "Before & after"],
    ...(agreement.assetType === "APARTMENT"
      ? [["arrival", "Arrival inspection"]]
      : []),
  ];

  return (
    <section
      id="condition-records"
      aria-labelledby="condition-records-heading"
      className="my-6 space-y-5 rounded-3xl border border-border bg-white p-4 sm:p-6"
    >
      <div>
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Shared condition record
        </p>
        <h2
          id="condition-records-heading"
          className="mt-2 text-2xl font-semibold tracking-tight"
        >
          Evidence for a fair exchange
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Document the starting condition together, then compare it with what
          comes back. Submitted records cannot be edited through the app.
        </p>
      </div>
      <p
        role="note"
        className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950"
      >
        Local demo evidence · Photos are stored in this browser using IndexedDB.
        They do not sync between devices and the identity switch is not
        authentication. Do not upload real private documents. The 48-hour
        deadline uses the demo device clock; server deadline processing is not
        connected.
      </p>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Condition record views</legend>
        {tabs.map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${tab === id ? "border-foreground bg-primary text-primary-foreground" : "border-border bg-white text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </fieldset>
      {!conditionAvailable ? (
        <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          The tenant must accept the agreement before the landlord can publish
          the condition baseline.
        </p>
      ) : (
        <>
          {tab === "baseline" && (
            <BaselinePanel
              key={`${agreement.id}/${actor.id}`}
              agreementId={agreement.id}
              assetType={agreement.assetType}
              termsVersion={agreement.termsVersion}
              actor={handoverActor}
              {...participants}
              record={state.baseline}
              onChange={props.onBaselineChange}
              storage={storage}
              locked={
                !["AWAITING_BASELINE", "AWAITING_FUNDING", "FUNDED"].includes(
                  agreement.status,
                )
              }
            />
          )}
          {tab === "return" && (
            <ReturnPanel
              key={`${agreement.id}/${actor.id}`}
              agreementId={agreement.id}
              actor={handoverActor}
              {...participants}
              baseline={state.baseline}
              record={state.returnRecord}
              storage={storage}
              active={agreement.status === "ACTIVE"}
              onSubmitReturn={props.onSubmitReturn}
            />
          )}
          {tab === "comparison" && (
            <EvidenceComparison
              baseline={state.baseline}
              returnRecord={state.returnRecord}
              storage={storage}
              participantNames={{
                [demoActors.landlord.id]: demoActors.landlord.displayName,
                [demoActors.tenant.id]: demoActors.tenant.displayName,
              }}
            />
          )}
          {tab === "arrival" && agreement.assetType === "APARTMENT" && (
            <>
              <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
                This agreement is a security deposit. This reusable arrival form
                records inspection evidence only; it does not convert the
                deposit into an advance or authorize an owner payment. A
                reservation advance requires its own accepted agreement and
                release confirmation.
              </p>
              <ArrivalInspectionPanel
                key={`${agreement.id}/${actor.id}`}
                agreementId={agreement.id}
                actor={handoverActor}
                {...participants}
                listing={{
                  title: agreement.title,
                  address: agreement.address,
                  description: agreement.terms,
                  promisedFeatures: [],
                }}
                record={state.arrivalRecord}
                storage={storage}
                enabled={
                  agreement.status === "FUNDED" || agreement.status === "ACTIVE"
                }
                onSubmitInspection={props.onSubmitInspection}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
