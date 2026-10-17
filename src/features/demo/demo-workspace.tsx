"use client";

import Image from "next/image";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  HandCoins,
  KeyRound,
  LockKeyhole,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  DemoIdentityProvider,
  demoActors,
  type PactActor,
} from "@/lib/auth/identity-provider";
import {
  acceptTerms,
  actorForId,
  approveFullRefund,
  approveSplit,
  createInitialDemoSnapshot,
  createDemoAgreement,
  declineSplit,
  formatMoney,
  fundAgreement,
  proposeSplit,
  submitReturn,
  recordBaseline,
  recordArrivalInspection,
  type DemoSnapshot,
} from "@/features/demo/model";
import { LocalDemoRepository } from "@/features/demo/repository";
import { HandoverWorkspace } from "@/features/handover/handover-workspace";
import AgreementSetupForm from "@/features/agreements/components/agreement-setup-form";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T12:00:00`));
}

function statusLabel(status: DemoSnapshot["agreement"]["status"]) {
  switch (status) {
    case "AWAITING_ACCEPTANCE":
      return "Awaiting acceptance";
    case "AWAITING_BASELINE":
      return "Awaiting baseline";
    case "AWAITING_FUNDING":
      return "Baseline review & funding";
    case "FUNDED":
      return "Awaiting baseline";
    case "ACTIVE":
      return "Rental active";
    case "RETURN_REVIEW":
      return "Return review";
    case "PROPOSAL_PENDING":
      return "Split proposed";
    case "COMPLETED":
      return "Settled";
  }
}

function getProgress(status: DemoSnapshot["agreement"]["status"]) {
  if (status === "AWAITING_ACCEPTANCE") return 1;
  if (status === "AWAITING_BASELINE" || status === "AWAITING_FUNDING") return 2;
  if (
    status === "FUNDED" ||
    status === "ACTIVE" ||
    status === "RETURN_REVIEW" ||
    status === "PROPOSAL_PENDING"
  )
    return 3;
  return 4;
}

export default function DemoWorkspace() {
  const repository = useMemo(() => new LocalDemoRepository(), []);
  const [snapshot, setSnapshot] = useState(createInitialDemoSnapshot);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const [allocationInput, setAllocationInput] = useState("300");
  const [reasonInput, setReasonInput] = useState(
    "Cleaning and key replacement costs",
  );
  const [showSetup, setShowSetup] = useState(false);
  const [disputeReviewId, setDisputeReviewId] = useState<string | null>(null);
  const [tenantConfirmedTerms, setTenantConfirmedTerms] = useState(false);

  useEffect(() => {
    let active = true;
    void repository.load().then((saved) => {
      if (!active) return;
      if (saved) setSnapshot(saved);
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [repository]);

  useEffect(() => {
    if (!hydrated) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "pact-demo-v1") return;
      void repository.load().then((saved) => {
        if (saved) setSnapshot(saved);
      });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [hydrated, repository]);

  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;
  const actor = actorForId(snapshot.activeActorId);
  const agreement = snapshot.agreement;
  const progress = getProgress(agreement.status);
  const isLandlord = actor.role === "landlord";
  const remaining = agreement.reservedMinor;
  const baseline = agreement.handover?.baseline;
  const baselineReady = Boolean(
    baseline &&
    baseline.termsVersion === agreement.termsVersion &&
    baseline.acknowledgedBy[demoActors.landlord.id] &&
    baseline.acknowledgedBy[demoActors.tenant.id],
  );
  const awaitingBaseline =
    agreement.status === "AWAITING_BASELINE" ||
    (agreement.status === "AWAITING_FUNDING" && !baseline);
  const proposal = agreement.proposal;
  const returnReviewId = `${agreement.id}:${agreement.handover?.returnRecord?.id ?? ""}`;
  const revisionRequested = agreement.status === "RETURN_REVIEW" && !!proposal;
  const settledRefund = agreement.ledger.reduce(
    (total, entry) =>
      total + (entry.account === "renter_refund" ? entry.amountMinor : 0),
    0,
  );
  const settledAllocation = agreement.ledger.reduce(
    (total, entry) =>
      total + (entry.account === "landlord_allocation" ? entry.amountMinor : 0),
    0,
  );

  function commit(
    action: (current: DemoSnapshot, currentActor: PactActor) => DemoSnapshot,
  ) {
    try {
      const latest = latestSnapshot.current;
      if (
        latest.agreement.id !== snapshot.agreement.id ||
        latest.activeActorId !== actor.id
      )
        throw new Error(
          "The agreement or identity changed. Review the current screen before continuing.",
        );
      const next = action(latest, actor);
      latestSnapshot.current = next;
      setSnapshot(next);
      setNotice("");
      void repository.save(next);
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "That action could not be completed.",
      );
      return false;
    }
  }

  function commitHandover(action: Parameters<typeof commit>[0]) {
    if (!commit(action))
      throw new Error(
        "The condition record was not saved. Review the current agreement and retry.",
      );
  }

  async function switchIdentity(role: "landlord" | "tenant") {
    const selected = demoActors[role];
    // The adapter keeps the UI independent from any one identity provider.
    const resolvedActor = await new DemoIdentityProvider(
      selected,
    ).getCurrentActor();
    const next = {
      ...snapshot,
      activeActorId: resolvedActor.id as DemoSnapshot["activeActorId"],
    };
    setSnapshot(next);
    setNotice("");
    setTenantConfirmedTerms(false);
    setDisputeReviewId(null);
    setShowSetup(false);
    void repository.save(next);
  }

  function sendProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(allocationInput);
    const ownerAllocationMinor = Number.isFinite(value)
      ? Math.round(value * 100)
      : Number.NaN;
    commit((current, currentActor) =>
      proposeSplit(current, currentActor, ownerAllocationMinor, reasonInput),
    );
  }

  async function resetDemo() {
    await repository.reset();
    const initial = createInitialDemoSnapshot();
    setSnapshot(initial);
    setAllocationInput("300");
    setReasonInput("Cleaning and key replacement costs");
    setShowSetup(false);
    setTenantConfirmedTerms(false);
    setDisputeReviewId(null);
    setNotice("Demo agreement reset to its starting point.");
  }

  function createAgreement(input: Parameters<typeof createDemoAgreement>[1]) {
    try {
      const next = createDemoAgreement(actor, input);
      setSnapshot(next);
      setShowSetup(false);
      setTenantConfirmedTerms(false);
      setDisputeReviewId(null);
      setNotice("Version 1 is ready for the tenant to review and accept.");
      void repository.save(next);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The agreement could not be created.",
      );
    }
  }

  const landlordAcceptance = agreement.acceptedBy.landlord;
  const tenantAcceptance = agreement.acceptedBy.tenant;

  return (
    <main className="pact-shell">
      <header className="topbar">
        <a aria-label="Pact home" className="brand" href="#top">
          <Image
            src="/brand/pact.svg"
            alt="Pact"
            width={165}
            height={68}
            className="brand-logo"
            preload
          />
        </a>
        <nav aria-label="Main navigation" className="main-nav">
          <a className="nav-link nav-link-active" href="#agreement">
            Agreements
          </a>
          <a className="nav-link" href="#activity">
            Activity
          </a>
        </nav>
        <div className="topbar-right">
          <span className="topbar-demo">
            <span /> DEMO MODE
          </span>
          <fieldset className="identity-switch">
            <legend className="sr-only">Choose a demo identity</legend>
            <button
              aria-pressed={isLandlord}
              className={
                isLandlord
                  ? "identity-option identity-selected"
                  : "identity-option"
              }
              onClick={() => void switchIdentity("landlord")}
              type="button"
            >
              <span className="avatar avatar-landlord">MP</span>
              <span>Landlord</span>
            </button>
            <button
              aria-pressed={!isLandlord}
              className={
                !isLandlord
                  ? "identity-option identity-selected"
                  : "identity-option"
              }
              onClick={() => void switchIdentity("tenant")}
              type="button"
            >
              <span className="avatar avatar-tenant">LM</span>
              <span>Tenant</span>
            </button>
          </fieldset>
        </div>
      </header>

      <div className="workspace" id="top">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">
              <Sparkles size={14} strokeWidth={2.2} /> RENTING, WITH MORE
              CLARITY
            </p>
            <h1>Good morning, {actor.displayName.split(" ")[0]}</h1>
            <p className="welcome-copy">
              One agreement keeps the deposit, expectations, and next steps
              clear for everyone.
            </p>
          </div>
          {isLandlord && (
            <button
              className="reset-button"
              onClick={() => setShowSetup((visible) => !visible)}
              type="button"
            >
              <Plus size={15} /> New agreement
            </button>
          )}
          <button
            className="reset-button"
            onClick={() => void resetDemo()}
            type="button"
          >
            <RotateCcw size={15} /> Reset demo
          </button>
        </div>

        <section aria-label="Demo mode notice" className="demo-notice">
          <div className="demo-notice-icon">
            <ShieldCheck size={20} />
          </div>
          <div>
            <strong>Safe to explore. This is a demo.</strong>
            <p>
              No money moves. Demo identities and agreement data stay in this
              browser.
            </p>
          </div>
          <span className="demo-notice-tag">SIMULATED FUNDS</span>
        </section>

        {notice && (
          <div className="inline-notice" role="status">
            {notice}
          </div>
        )}

        {showSetup && isLandlord && (
          <AgreementSetupForm
            isLandlord={isLandlord}
            onCancel={() => setShowSetup(false)}
            onCreate={createAgreement}
          />
        )}

        <HandoverWorkspace
          key={agreement.id}
          agreement={agreement}
          actor={actor}
          onBaselineChange={(record) =>
            commitHandover((current, currentActor) =>
              recordBaseline(current, currentActor, record),
            )
          }
          onSubmitReturn={(record) =>
            commitHandover((current, currentActor) =>
              submitReturn(current, currentActor, record),
            )
          }
          onSubmitInspection={(record) =>
            commitHandover((current, currentActor) =>
              recordArrivalInspection(current, currentActor, record),
            )
          }
        />

        <div className="dashboard-grid">
          <section
            aria-labelledby="agreement-heading"
            className="agreement-card"
            id="agreement"
          >
            <div className="agreement-card-top">
              <div className="agreement-kind">
                <span className="kind-icon">
                  <KeyRound size={16} />
                </span>{" "}
                {agreement.assetType === "APARTMENT"
                  ? "APARTMENT SECURITY DEPOSIT"
                  : "EQUIPMENT SECURITY DEPOSIT"}
              </div>
              <span
                className={`status-pill status-${agreement.status.toLowerCase().replaceAll("_", "-")}`}
              >
                <span /> {statusLabel(agreement.status)}
              </span>
            </div>

            <div className="agreement-heading-row">
              <div>
                <p className="section-kicker">YOUR AGREEMENT</p>
                <h2 id="agreement-heading">{agreement.title}</h2>
                <p className="address-line">{agreement.address}</p>
              </div>
              <span className="terms-readonly">
                VERSION {agreement.termsVersion}.0
              </span>
            </div>

            <div className="amount-block">
              <div>
                <p className="amount-label">
                  {agreement.status === "COMPLETED"
                    ? "SETTLED AMOUNT"
                    : "AGREED DEPOSIT"}
                </p>
                <p className="amount-value">
                  {formatMoney(agreement.amountMinor)}
                </p>
              </div>
              <div className="amount-side">
                <span className="amount-side-icon">
                  <LockKeyhole size={16} />
                </span>
                <div>
                  <span className="amount-side-title">
                    {agreement.status === "COMPLETED"
                      ? "Settlement complete"
                      : `${formatMoney(remaining)} reserved`}
                  </span>
                  <span className="amount-side-caption">Demo ledger · EUR</span>
                </div>
              </div>
            </div>

            <div className="parties-row">
              <PartyCard
                accepted={landlordAcceptance}
                active={isLandlord}
                initials="MP"
                label="LANDLORD"
                name={demoActors.landlord.displayName}
                onClick={() => void switchIdentity("landlord")}
                partyRole="landlord"
              />
              <div className="party-connector">
                <span />
              </div>
              <PartyCard
                accepted={tenantAcceptance}
                active={!isLandlord}
                initials="LM"
                label="TENANT"
                name={demoActors.tenant.displayName}
                onClick={() => void switchIdentity("tenant")}
                partyRole="tenant"
              />
            </div>

            <div className="terms-row">
              <div className="terms-icon">
                <FileText size={17} />
              </div>
              <div className="terms-copy">
                <strong>
                  Agreed terms · Version {agreement.termsVersion}.0
                </strong>
                <span>
                  {formatDate(agreement.startDate)} —{" "}
                  {formatDate(agreement.endDate)}
                </span>
              </div>
              <span className="terms-readonly">FIXED AFTER FUNDING</span>
            </div>
            <p className="terms-text">{agreement.terms}</p>

            <div className="progress-section">
              <div className="progress-heading">
                <span>Agreement progress</span>
                <span className="progress-count">
                  {progress} <span>/ 4</span>
                </span>
              </div>
              <div
                aria-label={`Step ${progress} of 4`}
                className="progress-track"
                role="img"
              >
                <span style={{ width: `${progress * 25}%` }} />
              </div>
              <div className="progress-labels">
                <span>Agree</span>
                <span>Condition</span>
                <span>Fund & return</span>
                <span>Settle</span>
              </div>
            </div>

            <div className="action-area">
              {agreement.status === "AWAITING_ACCEPTANCE" &&
                (agreement.acceptedBy[actor.role] ? (
                  <WaitingCard
                    icon={<Clock3 size={17} />}
                    title="Your terms are accepted"
                    text={`Waiting for ${actor.role === "landlord" ? "the tenant" : "the landlord"} to accept the same version.`}
                  />
                ) : (
                  <>
                    <label className="acceptance-check">
                      <input
                        checked={tenantConfirmedTerms}
                        onChange={(event) =>
                          setTenantConfirmedTerms(event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>
                        I reviewed and accept version {agreement.termsVersion}.0
                        of these terms.
                      </span>
                    </label>
                    <ActionPanel
                      description="Your acceptance applies to this version only. Any later revision would need fresh approval."
                      onClick={() =>
                        commit((current, currentActor) =>
                          acceptTerms(current, currentActor),
                        )
                      }
                      title="Accept the agreement"
                      buttonLabel={`Accept version ${agreement.termsVersion}.0`}
                      disabled={!tenantConfirmedTerms}
                    />
                  </>
                ))}
              {awaitingBaseline && (
                <WaitingCard
                  icon={<KeyRound size={17} />}
                  title={
                    isLandlord
                      ? "Publish the condition baseline"
                      : "Waiting for the landlord’s condition baseline"
                  }
                  text="The terms are accepted. The landlord records the initial condition below, then the tenant reviews it before funding. No deposit is reserved yet."
                />
              )}
              {agreement.status === "AWAITING_FUNDING" &&
                !awaitingBaseline &&
                (!baselineReady ? (
                  <WaitingCard
                    icon={<KeyRound size={17} />}
                    title={
                      isLandlord
                        ? "Waiting for tenant condition review"
                        : "Review the condition baseline"
                    }
                    text="Review the photographs and checklist below. The tenant must acknowledge this condition version before the deposit can be funded."
                  />
                ) : actor.role === "tenant" ? (
                  <ActionPanel
                    description="The terms and condition baseline are approved. Simulate reserving the full deposit to activate the rental."
                    onClick={() =>
                      commit((current, currentActor) =>
                        fundAgreement(current, currentActor),
                      )
                    }
                    title="The agreement is ready"
                    buttonLabel={`Simulate funding ${formatMoney(agreement.amountMinor)}`}
                    icon={<HandCoins size={17} />}
                  />
                ) : (
                  <WaitingCard
                    icon={<Clock3 size={17} />}
                    title="Waiting for the tenant to fund"
                    text="The agreed amount will appear as reserved demo funds. It is not spendable by either party."
                  />
                ))}
              {(agreement.status === "FUNDED" ||
                agreement.status === "ACTIVE") && (
                <WaitingCard
                  icon={<KeyRound size={17} />}
                  title={
                    agreement.status === "ACTIVE"
                      ? "Rental active"
                      : "Funded — awaiting condition baseline"
                  }
                  text={
                    agreement.status === "ACTIVE"
                      ? "Use the condition record below to document the return. The first declaration starts one 48-hour review window."
                      : "The owner records the initial condition below. Both parties must acknowledge the same baseline before the rental activates."
                  }
                />
              )}
              {agreement.status === "RETURN_REVIEW" &&
                (actor.role === "landlord" ? (
                  disputeReviewId === returnReviewId ? (
                    <div className="proposal-panel">
                      <div className="panel-heading">
                        <span className="panel-icon">
                          <HandCoins size={17} />
                        </span>
                        <div>
                          <strong>
                            {revisionRequested
                              ? `Revise proposal v${proposal.version}`
                              : "Suggest a fair split"}
                          </strong>
                          <span>
                            {revisionRequested
                              ? `The tenant asked to revise. You act next: propose a new version or approve a full refund. ${formatMoney(remaining)} stays reserved.`
                              : "The tenant must approve this exact proposal."}
                          </span>
                        </div>
                      </div>
                      <form className="proposal-form" onSubmit={sendProposal}>
                        <p className="refund-preview">
                          Demo — simulated funds. A new version requires fresh
                          tenant approval.
                        </p>
                        <label htmlFor="allocation">Landlord allocation</label>
                        <div className="input-with-prefix">
                          <span>€</span>
                          <input
                            id="allocation"
                            inputMode="decimal"
                            max={agreement.reservedMinor / 100}
                            min="0"
                            onChange={(event) =>
                              setAllocationInput(event.target.value)
                            }
                            required
                            step="0.01"
                            type="number"
                            value={allocationInput}
                          />
                        </div>
                        <label htmlFor="proposal-reason">Reason</label>
                        <input
                          id="proposal-reason"
                          maxLength={160}
                          onChange={(event) =>
                            setReasonInput(event.target.value)
                          }
                          placeholder="Briefly explain the proposed allocation"
                          required
                          value={reasonInput}
                        />
                        <p className="refund-preview">
                          <span>Tenant refund</span>
                          <strong>
                            {formatMoney(
                              Math.max(
                                0,
                                agreement.reservedMinor -
                                  Math.round(
                                    (Number(allocationInput) || 0) * 100,
                                  ),
                              ),
                            )}
                          </strong>
                        </p>
                        <button className="primary-action" type="submit">
                          Send split proposal <ArrowUpRight size={16} />
                        </button>
                      </form>
                      <button
                        className="text-action"
                        onClick={() => setDisputeReviewId(null)}
                        type="button"
                      >
                        Back to return review
                      </button>
                    </div>
                  ) : (
                    <div className="proposal-panel">
                      <div className="panel-heading">
                        <span className="panel-icon">
                          <ShieldCheck size={17} />
                        </span>
                        <div>
                          <strong>
                            {revisionRequested
                              ? `Revision requested for v${proposal.version}`
                              : "Review the return"}
                          </strong>
                          <span>
                            {revisionRequested
                              ? "The tenant requested a revision. Release the full deposit or start a dispute to revise the proposal."
                              : `Release ${formatMoney(remaining)} to the tenant if everything is in order, or start a dispute to propose a deduction.`}
                          </span>
                        </div>
                      </div>
                      <div className="proposal-form">
                        <button
                          className="primary-action"
                          onClick={() =>
                            commit((current, currentActor) =>
                              approveFullRefund(current, currentActor),
                            )
                          }
                          type="button"
                        >
                          <Check size={16} /> Release full deposit
                        </button>
                        <button
                          className="secondary-action"
                          onClick={() => setDisputeReviewId(returnReviewId)}
                          type="button"
                        >
                          Start dispute
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <WaitingCard
                    icon={<Clock3 size={17} />}
                    title={
                      revisionRequested
                        ? `Revision requested for v${proposal.version}`
                        : "Return review is open"
                    }
                    text={`The landlord acts next: ${revisionRequested ? "publish a revised proposal" : "suggest a split"} or approve a full refund. ${formatMoney(remaining)} stays reserved. Silence does not settle funds; no independent reviewer is involved.`}
                  />
                ))}
              {agreement.status === "PROPOSAL_PENDING" &&
                proposal &&
                (actor.role === "tenant" ? (
                  <div className="proposal-panel proposal-review">
                    <div className="panel-heading">
                      <span className="panel-icon">
                        <FileText size={17} />
                      </span>
                      <div>
                        <strong>
                          Review split proposal · v{proposal.version}
                        </strong>
                        <span>
                          Demo — simulated funds. Approving this version
                          completes the demo settlement.
                        </span>
                      </div>
                    </div>
                    <div className="split-summary">
                      <div>
                        <span>Your refund</span>
                        <strong>
                          {formatMoney(proposal.renterRefundMinor)}
                        </strong>
                      </div>
                      <div>
                        <span>Landlord allocation</span>
                        <strong>
                          {formatMoney(proposal.ownerAllocationMinor)}
                        </strong>
                      </div>
                    </div>
                    <blockquote>{proposal.reason}</blockquote>
                    <p className="refund-preview">
                      {formatMoney(remaining)} stays reserved until you approve.
                      Asking to revise or not responding does not settle funds.
                      No independent reviewer is involved.
                    </p>
                    <div className="proposal-actions">
                      <button
                        className="secondary-action"
                        onClick={() =>
                          commit((current, currentActor) =>
                            declineSplit(current, currentActor),
                          )
                        }
                        type="button"
                      >
                        Ask to revise
                      </button>
                      <button
                        className="primary-action"
                        onClick={() =>
                          commit((current, currentActor) =>
                            approveSplit(current, currentActor),
                          )
                        }
                        type="button"
                      >
                        <Check size={16} /> Approve this split
                      </button>
                    </div>
                  </div>
                ) : (
                  <WaitingCard
                    icon={<Clock3 size={17} />}
                    title="Split proposal sent"
                    text={`The tenant acts next: review version ${proposal.version} — ${formatMoney(proposal.renterRefundMinor)} refund and ${formatMoney(proposal.ownerAllocationMinor)} landlord allocation. ${formatMoney(remaining)} stays reserved while approval is pending. Silence does not settle funds. Demo — simulated funds; no independent reviewer is involved.`}
                  />
                ))}
              {agreement.status === "COMPLETED" && (
                <div className="settled-panel">
                  <span className="settled-icon">
                    <Check size={18} />
                  </span>
                  <div>
                    <strong>Demo settlement complete</strong>
                    <span>
                      {`${formatMoney(settledRefund)} to the tenant · ${formatMoney(settledAllocation)} to the landlord · ${formatMoney(remaining)} reserved. Demo — simulated funds; no real payment was made.`}
                    </span>
                  </div>
                </div>
              )}
              {!hydrated && (
                <div aria-live="polite" className="hydration-cover">
                  Loading saved demo…
                </div>
              )}
            </div>
          </section>

          <aside className="side-column">
            <section aria-labelledby="next-step-heading" className="next-card">
              <div className="side-card-header">
                <span className="side-card-icon">
                  <CircleDollarSign size={18} />
                </span>
                <span className="section-kicker">DEMO OVERVIEW</span>
              </div>
              <h2 id="next-step-heading">
                {agreement.status === "COMPLETED"
                  ? "All settled"
                  : "A clear path forward"}
              </h2>
              <p className="next-copy">
                {agreement.status === "PROPOSAL_PENDING"
                  ? "The agreement stays in review until both people approve the same split."
                  : agreement.status === "COMPLETED"
                    ? "The final outcome is recorded in the local demo ledger and activity history. No real payment was made."
                    : "Each step is visible to both parties. A landlord allocation needs tenant approval; a full refund returns to the tenant."}
              </p>
              <div className="next-step-box">
                <div className="next-step-top">
                  <span>NEXT STEP</span>
                  <span className="step-dot" />
                </div>
                <strong>
                  {nextActionText(
                    agreement.status,
                    actor.role,
                    !!baseline,
                    baselineReady,
                  )}
                </strong>
                <span className="next-step-person">
                  {nextActorText(agreement.status, actor.role, !!baseline)}
                </span>
              </div>
              <div className="security-points">
                <div>
                  <span>
                    <LockKeyhole size={14} />
                  </span>
                  <p>
                    <strong>Terms stay fixed</strong>
                    <small>Accepted version is kept with the agreement.</small>
                  </p>
                </div>
                <div>
                  <span>
                    <HandCoins size={14} />
                  </span>
                  <p>
                    <strong>Splits need agreement</strong>
                    <small>No silent deductions or one-sided settlement.</small>
                  </p>
                </div>
                <div>
                  <span>
                    <ShieldCheck size={14} />
                  </span>
                  <p>
                    <strong>Every step is recorded</strong>
                    <small>Review the shared activity below.</small>
                  </p>
                </div>
              </div>
            </section>

            <section aria-labelledby="details-heading" className="details-card">
              <div className="details-heading-row">
                <div>
                  <p className="section-kicker">AT A GLANCE</p>
                  <h2 id="details-heading">Agreement details</h2>
                </div>
                <span className="details-icon">
                  <FileText size={17} />
                </span>
              </div>
              <DetailLine
                label="Asset type"
                value={
                  agreement.assetType === "APARTMENT"
                    ? "Apartment"
                    : "Equipment"
                }
              />
              <DetailLine
                label="Deposit"
                value={formatMoney(agreement.amountMinor)}
              />
              <DetailLine label="Review window" value="48 hours" />
              <DetailLine
                label="Terms accepted"
                value={`${Number(landlordAcceptance) + Number(tenantAcceptance)} of 2`}
              />
              <div className="details-footer">
                <span>DEMO AGREEMENT</span>
                <span>ID · {agreement.id.slice(-8).toUpperCase()}</span>
              </div>
            </section>
          </aside>
        </div>

        <section
          aria-labelledby="activity-heading"
          className="activity-card"
          id="activity"
        >
          <div className="activity-header">
            <div>
              <p className="section-kicker">LOCAL DEMO RECORD</p>
              <h2 id="activity-heading">Agreement activity</h2>
            </div>
            <span className="activity-count">
              {agreement.activity.length} updates
            </span>
          </div>
          <div className="activity-list">
            {agreement.activity.map((item, index) => (
              <div className="activity-item" key={item.id}>
                <span
                  className={`activity-marker ${index === 0 ? "activity-marker-current" : ""}`}
                >
                  {index === 0 ? <Check size={14} /> : <span />}
                </span>
                <div className="activity-body">
                  <strong>{item.description}</strong>
                  <span>{item.actorName}</span>
                </div>
                <time dateTime={item.createdAt}>
                  {dateTimeFormatter.format(new Date(item.createdAt))}
                </time>
              </div>
            ))}
          </div>
          <div className="activity-footer">
            <span>
              <LockKeyhole size={13} /> Visible to both demo identities in this
              browser
            </span>
            <button
              onClick={() =>
                document
                  .getElementById("ledger")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              type="button"
            >
              View ledger <ChevronRight size={14} />
            </button>
          </div>
        </section>

        <section
          aria-labelledby="ledger-heading"
          className="ledger-card"
          id="ledger"
        >
          <div className="ledger-header">
            <div>
              <p className="section-kicker">SIMULATED TRANSACTIONS</p>
              <h2 id="ledger-heading">Demo ledger</h2>
            </div>
            <span className="ledger-badge">NO REAL FUNDS</span>
          </div>
          {agreement.ledger.length === 0 ? (
            <div className="ledger-empty">
              <span>
                <CircleDollarSign size={19} />
              </span>
              <p>
                <strong>No ledger entries yet</strong>
                <small>
                  After terms acceptance and condition review, simulated funding
                  and settlement steps appear here.
                </small>
              </p>
            </div>
          ) : (
            <div className="ledger-entries">
              {agreement.ledger.map((entry) => (
                <div className="ledger-entry" key={entry.id}>
                  <span
                    className={`ledger-entry-icon ${entry.amountMinor < 0 ? "ledger-out" : "ledger-in"}`}
                  >
                    {entry.amountMinor < 0 ? (
                      <ArrowUpRight size={15} />
                    ) : (
                      <ArrowDownLeft size={15} />
                    )}
                  </span>
                  <div>
                    <strong>{ledgerAccountLabel(entry.account)}</strong>
                    <small>Operation {entry.operationId.slice(0, 15)}</small>
                  </div>
                  <span
                    className={
                      entry.amountMinor < 0
                        ? "ledger-amount ledger-negative"
                        : "ledger-amount"
                    }
                  >
                    {entry.amountMinor > 0 ? "+" : ""}
                    {formatMoney(entry.amountMinor)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="page-footer">
          <span>PACT · RENTAL DEPOSIT DEMO</span>
          <span>
            <LockKeyhole size={12} /> Simulated flow · No bank connection
          </span>
          <span>Terms version {agreement.termsVersion}.0</span>
        </footer>
      </div>
    </main>
  );
}

function PartyCard({
  name,
  label,
  initials,
  partyRole,
  accepted,
  active,
  onClick,
}: {
  name: string;
  label: string;
  initials: string;
  partyRole: "landlord" | "tenant";
  accepted: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`Switch to ${label.toLowerCase()} demo identity`}
      aria-pressed={active}
      className={`party-card ${active ? "party-card-active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span
        className={`avatar party-avatar ${partyRole === "landlord" ? "avatar-landlord" : "avatar-tenant"}`}
      >
        {initials}
      </span>
      <span className="party-info">
        <span className="party-label">{label}</span>
        <strong>{name}</strong>
        <span className={accepted ? "acceptance accepted" : "acceptance"}>
          {accepted ? (
            <>
              <Check size={12} /> Terms accepted
            </>
          ) : (
            <>
              <Clock3 size={12} /> Awaiting acceptance
            </>
          )}
        </span>
      </span>
      {active && <span className="current-identity">YOU</span>}
    </button>
  );
}

function ActionPanel({
  title,
  description,
  buttonLabel,
  onClick,
  icon,
  disabled = false,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="action-panel">
      <div className="action-panel-heading">
        <span className="panel-icon">{icon ?? <Check size={17} />}</span>
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
      </div>
      <button
        className="primary-action"
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {buttonLabel} <ChevronRight size={16} />
      </button>
    </div>
  );
}

function WaitingCard({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="waiting-card">
      <span className="waiting-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function nextActionText(
  status: DemoSnapshot["agreement"]["status"],
  role: PactActor["role"],
  hasBaseline: boolean,
  baselineReady: boolean,
) {
  switch (status) {
    case "AWAITING_ACCEPTANCE":
      return role === "tenant"
        ? "Accept the current agreement"
        : "Waiting for the tenant to accept";
    case "AWAITING_BASELINE":
      return role === "landlord"
        ? "Publish the condition baseline"
        : "Waiting for the landlord’s condition baseline";
    case "AWAITING_FUNDING":
      if (!hasBaseline) return "Waiting for the landlord’s condition baseline";
      if (!baselineReady)
        return role === "tenant"
          ? "Review and acknowledge the condition baseline"
          : "Waiting for tenant condition review";
      return role === "tenant"
        ? "Reserve the demo deposit"
        : "Waiting for simulated funding";
    case "FUNDED":
      return "Record and acknowledge the condition baseline";
    case "ACTIVE":
      return "Document the return when the rental ends";
    case "RETURN_REVIEW":
      return role === "landlord"
        ? "Release the deposit or start a dispute"
        : "Waiting for landlord review";
    case "PROPOSAL_PENDING":
      return role === "tenant"
        ? "Review and respond to the split"
        : "Waiting for tenant approval";
    case "COMPLETED":
      return "No further action needed";
  }
}

function nextActorText(
  status: DemoSnapshot["agreement"]["status"],
  role: PactActor["role"],
  hasBaseline: boolean,
) {
  if (status === "AWAITING_ACCEPTANCE")
    return role === "tenant" ? "Luca Martin · Tenant" : "Luca Martin · Tenant";
  if (
    status === "AWAITING_BASELINE" ||
    (status === "AWAITING_FUNDING" && !hasBaseline)
  )
    return "Maya Petrova · Landlord";
  if (status === "AWAITING_FUNDING") return "Luca Martin · Tenant";
  if (status === "FUNDED" || status === "ACTIVE") return "Luca Martin · Tenant";
  if (status === "RETURN_REVIEW") return "Maya Petrova · Landlord";
  if (status === "PROPOSAL_PENDING") return "Luca Martin · Tenant";
  return "Agreement complete";
}

function ledgerAccountLabel(
  account: DemoSnapshot["agreement"]["ledger"][number]["account"],
) {
  switch (account) {
    case "renter_available":
      return "Tenant demo balance";
    case "agreement_reserved":
      return "Agreement reserved";
    case "renter_refund":
      return "Tenant refund";
    case "landlord_allocation":
      return "Landlord allocation";
  }
}
