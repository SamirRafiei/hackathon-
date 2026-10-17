# Pact — Landlord–Tenant Deposit Implementation Plan

> Make a pact. Keep it fair.

**Scope pivot: 17 October 2026.** This plan replaces the equipment-led hackathon plan. Keep the existing application foundation; implement residential deposit management for one landlord and one tenant per agreement. Shared housing, freelance payments, and equipment rentals are future extensions.

**Team:** Five people. **Delivery budget:** 24 hours from the team's agreed kickoff; the time blocks below are relative targets, not a claim that 24 hours remain.

**Prototype:** Simulated funds only. No live Wise integration, regulated escrow, real payment movement, or legal certification. Display “Demo — simulated funds” beside balances and actions. Do not imply partnership or existing Wise functionality.

## 1. Product and success criteria

Pact connects a residential deposit to accepted terms, acknowledged condition records, a predictable inspection window, and a documented settlement. The landlord benefits from deposit tracking across properties and supported deduction requests. The tenant benefits from visibility, a refund deadline, and control over disputed deductions.

- [ ] Landlord creates a tenancy deposit record and invites one tenant.
- [ ] Both accept the same immutable terms and 48-hour release rule.
- [ ] Tenant fully funds the simulated deposit before the agreement can activate.
- [ ] Both acknowledge the versioned move-in condition record.
- [ ] Landlord sees several independently tracked deposit records in a dashboard.
- [ ] Tenant submits move-out evidence and starts the 48-hour review window.
- [ ] Landlord approves a full refund or disputes receipt/condition within the window.
- [ ] Expiry without a timely dispute triggers a full refund through a server job.
- [ ] A dispute supports reasons, cost evidence, discussion, and mutually approved settlement proposals.
- [ ] Full refunds and agreed splits produce balanced ledger postings and a receipt exactly once.
- [ ] The complete journey works in the deployed application and survives refresh.

### Scope boundaries

Required: property label/address, tenancy dates, deposit terms and currency, one landlord and tenant, private photos/documents, condition checklist, dashboard, discussion, history, and seeded demo scenarios.

Primary demo currency: EUR. Preserve an existing currency formatter and currency field. Extra supported currencies are optional; one agreement never mixes currencies or converts refunds.

Deferred: shared contributions, percentage sliders, representative consent, QR/code verification, reviewer queues or binding decisions, negotiation chatbot, persistent notification centre, email reminders, payment-processing workers/failure simulators, rent collection, maintenance management, marketplace discovery, full lease generation, certified signatures, and real payment connections.

The dashboard is a summary of deposit agreements across properties, not a separate property-management product. Equipment and freelance flows are not required to prove this pivot.

## 2. Team ownership

These proposed revised assignments retain the current team and redistribute equipment/reviewer work into housing workflows. Confirm availability at kickoff; assignments do not imply teammates have already approved the pivot.

| Owner | Workstream | Deliverables |
|---|---|---|
| Sameer | Money and authoritative state | Ledger, funding/settlement transactions, state constraints, expiry routine; agree schema with the other owners |
| Valera Murzin | Identity and agreements | Auth, invitations, terms/version acceptance, property/tenancy fields, access helpers |
| Hayk | Shared interface and integration | Design primitives, landlord/tenant dashboards, deposit views, funding UI, receipts, first deployed preview |
| Tayma AlDabbas | Condition records | Private uploads, room/area checklist, versioned baseline, acknowledgements, move-out submission, before/after comparison |
| Aiperi | Review and negotiation | Inspection actions, claims and cost justification, discussion/proposals/approvals, expiry integration with Sameer, demo coordination |

Sameer coordinates financial contracts; Hayk coordinates application integration/deployment; Aiperi coordinates rehearsal. Each owner verifies their slice. Do not make the entire sprint depend on one person writing every database operation: agree reviewed contracts early and keep financial writes under one consistent implementation.

Use short-lived branches and small PRs. Share schema, operation types, fixture IDs, and UI primitives before extensive feature development. Build/type check and focused verification accompany each merge. Keep credentials outside Git.

## 3. Product rules

### Identity, invitations, and accepted terms

- One account may be landlord in one agreement and tenant in another. Roles belong to agreements; there are no account tiers.
- An invitation identifies one intended tenant. Require authentication and verified matching identity before revealing private details or accepting membership. Preserve invitation continuation after sign-in.
- Retain secure token expiry/revocation if already scaffolded; never turn a shareable link into public evidence access. Use pre-provisioned test identities for presentation.
- Terms include property, parties, tenancy dates, deposit, currency, inspection policy, default refund recipient, and accepted deduction/dispute rules.
- Either participant can request corrections. Landlord republishes the version; both accept it again. A separate formal change-request subsystem is unnecessary for the MVP.
- Once funded, terms and participants are frozen. Do not overwrite accepted records.
- These are deposit-workflow terms and acceptance records, not a claim to generate an enforceable tenancy contract.

### Funding, activation, and cancellation

- Tenant funds the entire deposit in one atomic simulated transaction. Reject insufficient available balance and duplicate funding.
- Drafts and accepted agreements can exist before funding. Activation requires full funding and both parties' acknowledgement of the move-in condition record.
- A funded agreement awaiting its baseline remains explicitly labelled as not active.
- Engineering default for the MVP: either side can cancel before activation; return any funded deposit to the tenant atomically. Never allocate unfunded value. After activation, use move-out/dispute workflows.
- Use one fixed currency throughout and no platform fees or interest. Do not add artificial payment-processing attempts or workers merely to animate funding.

### Condition records

- Organise baseline evidence by room/area, issue, and relevant inventory/key details. Keep the checklist small and reusable.
- Either party can add corrections before both acknowledge the same baseline version. A revision invalidates acknowledgements of the old baseline.
- Preserve acknowledged evidence and its version; later additions do not silently replace it.
- Store actor and server upload/submission timestamps. Neither timestamps nor in-app capture prove physical condition or causation.
- Evidence viewing and discussion are separate from authorising a deduction.

### Move-out and the 48-hour rule

- Tenant submits an explicit move-out declaration, key-return details, and evidence. The server records `move_out_submitted_at` and `inspection_deadline = move_out_submitted_at + 48 hours` exactly once.
- An early repeated submission, edited evidence, or landlord acknowledgement cannot reset the clock. Preserve supplemental evidence separately.
- Make the deadline and landlord's next action visible immediately. Background expiry does not depend on a browser remaining open.
- Landlord can approve the full tenant refund early or raise a dispute before the deadline. A refusal to acknowledge receipt must be recorded as a dispute, not an indefinite pending acknowledgement.
- A timely dispute concerning return, keys, or condition pauses the default refund and opens the discussion panel. Submission is the tenant's assertion; it does not prove receipt. The landlord must be able to contest it.
- No timely dispute means the pre-authorised full refund executes at expiry. Compare authoritative server time and claim eligibility inside the same locked transaction as expiry.
- At or after expiry, a new claim cannot block a refund that is already due or reverse a completed settlement through normal actions. Surface delayed processing truthfully.
- The 48-hour policy is a prototype rule; do not present it as a universal tenancy requirement or a substitute for legal rights.

### Claims, discussion, and settlement

- Landlord's claim identifies the issue, requested amount, responsibility argument, and cost basis: repair quote, replacement estimate, or a relevant agreed charge. Evidence supports a claim; it does not establish legal validity.
- Both can submit messages/evidence and propose a complete split of the reserved balance. Tenant refund plus landlord allocation must equal the funded amount; neither may be negative.
- A proposal binds its amounts and explanation to one immutable version. Both explicitly approve that version; changing it resets approvals. The proposer's explicit confirmation can count as their approval.
- Rejecting a proposal keeps the dispute open. No response within an open dispute is not permission to pay either side.
- An accepted split settles the whole deposit once. Streaming undisputed portions of one tenant's balance is outside the MVP.
- An unresolved case remains reserved with an honest next-action/status explanation. No chatbot or reviewer may transfer funds in this sprint. Document independent dispute resolution as unfinished production work.

### Future shared housing

If added later, each tenant has an independently tracked contribution. An agreed settlement of one share must not wait for another tenant's dispute, and one tenant cannot approve spending someone else's money. A handover representative requires explicit consent from every other consumer. No proportional-liability assumption follows automatically from contribution percentages.

## 4. Screens and structure

Keep most actions in one agreement detail view, using sections or dialogs rather than a separate page for every status.

| Screen | Contents |
|---|---|
| Sign-in and invitation | Authentication, protected review, continue to intended agreement |
| Dashboard | Landlord property/deposit records or tenant agreements; reserved totals by currency; next actions |
| Create/edit deposit agreement | Property, dates, tenant, amount, terms and policy |
| Agreement detail | Accepted terms, deposit status, funding, baseline, move-out, deadlines, timeline |
| Condition comparison | Acknowledged baseline and move-out evidence side by side |
| Discussion and settlement | Claim, cost justification, messages/evidence, proposals and approvals |
| Settlement receipt | Exact refund/allocation, completion timestamp, ledger reference |

Keep demo balances labelled as simulated. Landlord reserved totals must never appear as spendable landlord money. Summarise currencies separately; do not add unlike currencies into one total.

Retain Next.js, TypeScript, Tailwind, Supabase Auth/PostgreSQL/private Storage, and Vercel. No stack rewrite or microservices.

```text
src/app/                       routes and thin server actions/handlers
src/components/ui/             shared interface primitives
src/features/agreements/       tenancy terms, invitation, acceptance
src/features/deposits/         simulated funding, balances, receipts
src/features/condition/        baseline, move-out, private evidence
src/features/disputes/         claims, discussion, settlement proposals
src/lib/domain/                schemas, states, operation contracts
src/lib/auth/                  actor and agreement-access checks
src/lib/supabase/              browser/server clients
supabase/migrations/           schema, policies, atomic operations, expiry job
scripts/                       controlled demo provisioning/reset
tests/                         critical money, access, deadline and flow checks
```

Prefer reusing existing folders over renaming code for cosmetic consistency. No code changes are claimed by this planning pivot.

## 5. Data and state contracts

| Concept | Responsibility |
|---|---|
| Profiles | Auth identity and display name |
| Agreements and versions | Property metadata, parties, terms, currency, amount, policy, lifecycle |
| Participants/invitations/acceptances | Membership, protected invitation, exact-version acceptance |
| Deposit funding | Required amount, funder, funding transaction |
| Condition records/acknowledgements | Versioned baseline, actor approvals, move-out submission |
| Evidence files | Private path, uploader, phase, record, MIME/size, timestamps |
| Disputes/messages | Claim amount and basis, discussion and evidence references |
| Settlement proposals/approvals | Immutable split and both parties' consent |
| Ledger transactions/entries | Balanced, attributable simulated value movements |
| Settlements and audit events | Unique final disposition, timeline of authoritative changes |

Use existing compatible tables instead of creating redundant replacements. Detailed column names and migrations are engineering tasks; this conceptual model is not a claim that they already exist.

```text
Agreement:
draft -> awaiting_acceptance -> awaiting_funding -> awaiting_baseline
      -> active -> inspecting -> completed
                         inspecting -> disputed -> completed
Before activation: -> cancelled (refund any funded deposit)

Deposit: unfunded -> reserved -> settled
Dispute: none -> open -> resolved
```

Critical operations: publish/accept terms, claim invitation, fund deposit, publish/acknowledge baseline, activate agreement, submit move-out, approve full refund, open dispute, send discussion message, propose/approve settlement, process due inspections, cancel before activation.

Every operation checks identity, membership, current version/state, and payload on the server. Financial changes execute atomically with ledger and audit updates. Client-visible tables/files need appropriate access policies; hidden buttons are not authorisation.

Required invariants:

- Integer minor-unit amounts; a transaction never mixes currencies.
- Funded amount = remaining reserved amount + cumulative tenant refunds + landlord allocations.
- Append-only balanced ledger; corrections use compensating entries.
- Unique funding/final settlement and idempotent commands prevent duplicate postings.
- Claim, expiry, approval, and cancellation use consistent locking and state checks.
- Default refund and agreed split reuse one settlement operation.
- Server expiry job is retry-safe and runs without a browser; team can inspect last-run/failure status.

Keep a private uploader with basic supported photos and PDF documents. Check access, type, and size; use short-lived authorised downloads. Rich previews, image conversion, and capture verification are optional.

## 6. Delivery sequence and checkpoints

### T+0–2: Shared foundation and product contracts

- Confirm this pivot, team ownership, current repository state, and remaining time.
- Reuse the scaffold and CI; record exact states, operations, fixture IDs, and shared UI conventions.
- Provision database, Auth, private evidence storage, and first deployed preview.
- Agree the 48-hour submission trigger and default tenant refund; remove equipment/group/reviewer requirements from active tasks.

Exit: all five people can run the app, access the preview, and build against the same contracts.

### T+2–6: Agreement and funding

- Valera: create tenancy deposit, protected invitation, versioned acceptance.
- Sameer: ledger and atomic funding/cancellation, access foundations.
- Hayk: shared dashboard and agreement detail, funding controls, deployment.
- Tayma: baseline uploader/checklist and acknowledgement view against contracts.
- Aiperi: inspection and discussion/proposal interface against contracts.

Exit: two authenticated users create, accept, and fully fund the same persisted agreement. Stranger access is denied.

### T+6–12: Full-refund journey

- Integrate baseline acknowledgement and activation.
- Integrate move-out submission, 48-hour deadline, and landlord inspection actions.
- Complete early approval and background expiry using the same settlement function.
- Show a balanced receipt and persistent activity timeline.

Exit: the complete two-party housing journey works on the deployed app; expiry also works with no page open.

### T+12–18: Negotiated deduction and multi-property overview

- Claim with cost basis, discussion messages/evidence, exact split proposal, both approvals.
- Preserve disputed funds when no agreement is reached.
- Compare move-in and move-out records.
- Seed multiple property agreements for the landlord overview, without introducing a property-management subsystem.
- Verify claim/expiry race, duplicate actions, stale approvals, and privacy.

Exit: full refund, negotiated split, and an honestly unresolved dispute work. Freeze features at T+18.

### T+18–22: Verification and demo polish

- Complete critical checks below, mobile/keyboard basics, loading/error/permission states.
- Verify deployed Auth continuation, storage, migrations, expiry processing, and receipts.
- Prepare coherent demo data, screenshots, a backup walkthrough, and clear prototype language.

### T+22–24: Rehearsal and submission buffer

- Rehearse on final URL with independent landlord/tenant sessions.
- Fix only blockers; preserve the last working deployment.
- Complete submission materials and submit before the deadline.

If behind schedule, cut rich previews, optional currencies, dashboard polish, and extensions before reducing correctness or dropping the full-refund/negotiated-split paths.

## 7. Verification

- [ ] Both accept identical terms; revisions invalidate stale acceptance; funded terms cannot change.
- [ ] Full funding and baseline acknowledgement are required for activation.
- [ ] Stranger cannot access agreement, invitation contents, private evidence, or ledger.
- [ ] Tenant cannot approve landlord actions; landlord cannot debit or settle a disputed deposit unilaterally.
- [ ] Repeated funding/refund requests and job reruns create one outcome.
- [ ] Tenant submission sets one 48-hour deadline; no acknowledgement or repeated submission extends it.
- [ ] A timely receipt/condition dispute stops default release; an expired claim cannot reverse settled funds.
- [ ] Claim/expiry and proposal-approval races conserve value and produce one valid state.
- [ ] Expiry executes without an open browser; delayed jobs show a truthful pending state.
- [ ] A changed proposal invalidates old approvals; unsettled disputes retain reserved funds.
- [ ] €1,000 can refund fully or settle as €920 to tenant / €80 to landlord; totals and currency remain correct.
- [ ] Confirmed evidence cannot be silently replaced; server timestamps are not presented as proof of capture time.
- [ ] Refresh and a new session show the same state, timeline, and receipt.
- [ ] Pre-activation cancellation returns exactly the funded amount.

These are focused product and money checks, not a requirement for exhaustive UI snapshot coverage.

## 8. Demo and release

Provision landlord Alex and tenant Sam plus coherent seeded agreements: awaiting funding, active with acknowledged baseline, near inspection expiry, disputed, and completed. Dashboard records across several properties illustrate landlord administration. Clearly identify seeded records and the near-due fixture.

Suggested five-minute presentation:

1. Explain the deposit problem and the benefit to both parties.
2. Show Alex's portfolio of deposit records, reserved totals, and required actions.
3. Open Sam's €1,000 agreement; show accepted terms and simulated funding.
4. Show acknowledged baseline versus move-out evidence and the 48-hour review.
5. Demonstrate an approved refund and near-expiry automatic release on separate fixtures.
6. Open the disputed example: €120 requested with evidence, counteroffer of €80, both approvals, €920/€80 receipt.
7. State that funds are simulated and real custody/integration and independent dispute resolution remain future work.

Keep credentials and privileged keys outside Git/client bundles. Commit setup instructions, reproducible migrations and non-secret fixtures. Reset only allowlisted demo data in a dedicated environment. Verify deployment access, direct links, private-file policies, and scheduler health before rehearsal.

## 9. Production boundaries and assumptions

Separate real deposit/payment authorisation, jurisdiction-specific tenancy requirements, fraud controls, and independent dispute resolution from the demo's implementation claims. Do not imply the 48-hour rule replaces statutory deadlines or that digital acceptance creates certified signatures. Landlord discipline and improved trust are hypotheses to validate with users.

This pivot updates planning only. Preserve the existing scaffold completion record; mark housing-specific functionality as pending until its checks pass. Revised team assignments require team acknowledgement, not a fabricated completion status.

## 10. Current completion record

| Checkpoint | Status |
|---|---|
| Local application foundation | Previously recorded complete in the source plan; not revalidated by this document |
| Landlord–tenant scope and updated assignments | Prepared; team acknowledgement pending |
| Housing schema and operation contracts | Pending |
| Deployed funded agreement | Pending |
| Full refund and timed expiry | Pending |
| Dispute and negotiated split | Pending |
| Multi-property dashboard demo data | Pending |
| Verification, rehearsal, submission | Pending |
