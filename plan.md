# Wise Deposit Protection — implementation plan

> Secure deposits for anything you rent. 
Updated: 17 October 2026. Product proposal and 24-hour hackathon build plan.

**One conditional-payment engine, two payment purposes, three demonstration use cases:** apartment security deposits, equipment security deposits, and protected apartment reservation advances for students renting remotely.

**Prototype boundary:** All funding, reservation, refunds, and owner allocations are simulated ledger entries. No actual funds are held or moved. No live Wise integration, Wise authentication, partnership, regulated escrow service, or legal certification is claimed. Display **“Demo — simulated funds”** beside balances and financial actions. “Protected” describes the proposed product; prototype records do not provide financial protection.

This supersedes the landlord-only scope pivot. Preserve the existing Next.js/Supabase foundation and useful agreement, evidence, ledger, dashboard, and negotiation work. Do not claim any feature implemented merely because it appears in this plan.

## 1. Problem, users, and value

Renters often commit money before they can verify the asset or trust the owner. Owners want evidence of commitment and a fair way to recover justified damage costs. Informal transfers and chat messages leave both parties without shared terms, reliable deadlines, or a clear settlement history.

For international students reserving accommodation remotely, there is an additional gap between finding a home and arriving to inspect it. A student might reserve a Budapest apartment in June or July and arrive in August. This is an illustrative scenario, not a verified claim about local market seasonality. Fake listings, impersonation, unavailable properties, and materially misleading descriptions can turn an advance payment into a loss.

| Target user | Need | Proposed value |
|---|---|---|
| Apartment tenant | Recover a security deposit fairly | Accepted condition baseline, visible refund deadline, challengeable deductions |
| Equipment renter | Recover a short-duration deposit | Same protection for cameras, bikes, or tools, with asset-specific evidence |
| Remote student | Commit to accommodation before arrival | Demonstrate payment commitment without releasing an advance before inspection |
| Landlord/equipment owner | Secure commitment and justify damage claims | Funding visibility, agreed terms, documented evidence and settlement |
| Future distribution partners | Add trust to existing rental journeys | Universities, relocation services and rental platforms could embed the workflow |

**Value proposition:** Both sides agree what the money is for, when it can be released, and how disagreements are handled. The system connects accepted terms, private evidence, deadlines, and a traceable settlement. It reduces selected risks; it does not eliminate scams or guarantee factual truth.

This is a payment-protection feature, not a rental marketplace, full property-management system, or general-purpose dispute court. Business/distribution hypotheses require user validation. Pricing is outside the MVP; no prototype fees or interest.

## 2. One engine, configurable purposes

Keep `purpose` separate from `asset_type`. Apartment and equipment deposits differ mainly in metadata and duration; a reservation advance differs in the normal recipient and release conditions.

| Configuration | Apartment security deposit | Equipment security deposit | Student reservation advance |
|---|---|---|---|
| `purpose` | `SECURITY_DEPOSIT` | `SECURITY_DEPOSIT` | `RESERVATION_ADVANCE` |
| `asset_type` | `APARTMENT` | `EQUIPMENT` | `APARTMENT` |
| Intended use | Damage/agreed unpaid obligations | Damage/agreed rental obligations | Payment credited toward an agreed reservation/rent obligation |
| Normal holding period | Tenancy | Equipment rental | Reservation until arrival/inspection |
| Success condition | Return/move-out and inspection complete | Return and inspection complete | Renter inspects property, confirms access and conformity, explicitly approves release |
| Normal recipient | Renter, less accepted/resolved deductions | Renter, less accepted/resolved deductions | Owner |
| Failure/dispute | Damage, receipt, keys, deductions | Damage, missing accessories, non-return | Missing/fake/unavailable/misrepresented home or failed access |
| Owner silence | Refund after uncontested return review | Refund after uncontested return review | No unilateral owner payout; use advance-specific timeout rules |

Versioned policy fields: funding deadline, start/end or arrival dates, return-review duration, arrival confirmation deadline, cancellation rules, evidence requirements, permitted charges, default allocation, and dispute/escalation deadlines. These are validated configuration fields, not user-written executable rules.

Use a **48-hour review window** for both security-deposit demos, retaining the latest housing plan's simpler submission-triggered rule. Equipment can use a different accepted duration later; do not hard-code separate engines. The earlier 24-hour owner-acknowledgement trigger is superseded because a silent owner must not prevent the clock from starting.

An advance is not automatically converted into a security deposit. If a student also needs an ongoing security deposit, create a separately accepted and funded agreement, optionally linked by `rental_reference`. Never count one amount as both paid rent and a refundable deposit.

## 3. End-to-end journeys

### 3.1 Shared setup and acceptance

1. Owner creates an agreement: purpose, asset, parties, amount/currency, dates, policies and evidence requirements. Apartment fields include address/unit, listing snapshot, arrival/key arrangements and relevant inventory. Equipment fields include model/serial number, accessories and return location.
2. Invite one renter with an expiring, revocable, high-entropy link. Store a token hash. Require sign-in and matching verified email before revealing private terms or claiming membership. Preserve invitation continuation through sign-in.
3. Renter requests corrections if needed. Owner publishes an immutable version. Both explicitly accept that exact version; revisions invalidate earlier approvals.
4. Show the default recipient, deadlines, cancellation policy and possible deductions before acceptance. Purpose-specific labels explain “refundable security deposit” versus “advance payment to owner after inspection.”
5. Renter simulates funding after both accept. The server debits available demo value and credits reserved demo value atomically. Freeze terms and membership once funded.

One ordinary account can own one agreement and rent in another. Roles belong to agreements. MVP: one owner and one renter; neither can fill both roles in the same agreement.

### 3.2 Apartment and equipment security deposits

1. Both acknowledge the same versioned baseline: room/inventory/key checklist for an apartment; condition/serial/accessory checklist for equipment. A revision resets acknowledgements.
2. Full funding plus both baseline acknowledgements activates the rental. Show “funded — awaiting handover baseline” before activation.
3. Renter submits a return/move-out declaration with location, key/accessory details and evidence. This asserts return; it does not prove physical receipt.
4. Server starts the accepted 48-hour review window exactly once. An owner acknowledgement or supplemental upload cannot restart it. Owner can dispute non-receipt, missing keys/accessories or condition within that window.
5. Owner can approve a full refund early. With no timely dispute, a background job refunds the full reserved amount to the renter at expiry.
6. A timely claim restricts the full amount while both discuss evidence and negotiate. A mutually approved split or simulated reviewer decision settles it once.

After activation, overdue return is an alert/escalation flag, not automatic deposit forfeiture. Either party can flag a problem and open an exception case while active; an owner cannot simply mark a renter's funds as theirs. No routine refund occurs while the rental is still active.

### 3.3 Protected student reservation advance

1. Owner supplies listing snapshot, address/unit, authority-to-let information, arrival time/access arrangements, what the advance will pay for, and cancellation/refund policy. Verification status is explicit; demo checks are labelled simulated.
2. Both accept; student simulates funding. Owner sees a commitment confirmation, not spendable money. No early release action is offered before the agreed arrival stage.
3. At arrival, student inspects the actual home and verifies access, availability and material conformity with the accepted listing. Owner may submit handover evidence; owner assertions cannot release funds.
4. Student explicitly confirms the agreed conditions and approves the exact owner payment. Display the amount, recipient and finality before confirmation. This records consent, not independent proof that the listing is genuine.
5. The server settles the advance to the owner. An ongoing security deposit remains a separate agreement.
6. If the home is missing, inaccessible, unavailable or materially different, student opens a dispute and supplies evidence; funds stay reserved. Owner can agree a refund or negotiate a split.
7. If there is no student approval, the deadline alone never releases the advance to the owner. Follow the rules below for non-response or a disputed no-show.

## 4. State machine and authoritative operations

Use one lifecycle with purpose-specific guards and a separate money status. Do not encode every UI label as another lifecycle state.

```text
DRAFT -> AWAITING_ACCEPTANCE -> AWAITING_FUNDING -> FUNDED

SECURITY_DEPOSIT:
  FUNDED -> ACTIVE                  [both acknowledge current baseline]
  ACTIVE -> REVIEW_PENDING          [renter submits return/move-out]
  REVIEW_PENDING -> SETTLING         [owner approves refund OR deadline, no dispute]
  FUNDED / ACTIVE / REVIEW_PENDING -> DISPUTED [permitted exception or timely claim]

RESERVATION_ADVANCE:
  FUNDED -> REVIEW_PENDING           [agreed arrival/inspection stage begins]
  REVIEW_PENDING -> SETTLING         [renter explicitly approves owner payment]
  FUNDED / REVIEW_PENDING -> DISPUTED [availability, cancellation or handover issue]
  REVIEW_PENDING -> SETTLING         [refund deadline, no timely owner objection]

BOTH:
  DISPUTED -> SETTLING               [both approve same split OR demo reviewer decides]
  SETTLING -> COMPLETED              [all ledger legs posted successfully]
  eligible pre-activation state -> CANCELLED [refund funded value atomically]

Money: UNFUNDED -> RESERVED -> SETTLED
Case: OPEN -> NEGOTIATING / AWAITING_EVIDENCE / REVIEW_REQUIRED -> RESOLVED
```

`CANCELLED` means any reserved value has actually been refunded. `COMPLETED` includes full refund, full owner payment or partial allocation, with outcome stored separately. Do not mark financial completion before settlement succeeds. In the simulated provider, settlement can post all legs atomically; retain `SETTLING` as an operation boundary without inventing payment delays.

All mutations check authenticated actor, agreement membership or assigned reviewer authority, accepted version, current state and payload. Lock the agreement/financial row consistently, validate transitions, post ledger entries and append audit history in a single database transaction. Client buttons and browser clocks are never authoritative.

Core commands: publish/accept terms, claim invitation, fund, cancel, publish/acknowledge baseline, activate, submit return, enter arrival review, approve refund/advance release, open dispute, submit evidence/message, propose/approve settlement, assign/decide case, process deadlines.

## 5. Deductions, disputes, cancellation and timeouts

### Allocation and consent

- Store integer minor units and one currency per agreement. Primary demo currency: EUR. No FX, fees, interest or floating-point money.
- A final proposal specifies `renter_refund_minor` and `owner_allocation_minor`; both are nonnegative and sum exactly to the reserved amount. No deduction can exceed the funded amount.
- Example: €1,000 apartment deposit, €120 claimed, €80 accepted: €920 renter refund and €80 owner allocation. Equipment example: €300 deposit, accepted €25 damage: €275 refund and €25 allocation.
- For an advance, a split is a negotiated payment/refund, not a damage deduction by default. E.g. €600 funded, accepted cancellation split: €550 refunded and €50 allocated only with both approvals or a demo review decision.
- Both parties must explicitly approve the same immutable proposal version. A new amount or explanation resets approvals. Silence is not consent. Reading evidence is not payment approval.
- Settle the entire amount once. Releasing undisputed portions incrementally is deferred.

### Claims and independent review

- Claims capture type, reason, requested allocation, relevant policy and supporting evidence/cost basis. The owner does not decide whether their own claim is valid.
- Both parties can add photos, receipts, quotes, listing/communication records and explanations. Initial missing evidence is flagged, not treated as a win or loss. New evidence does not rewrite accepted baseline records.
- If rejected or unresolved 24 hours after case opening, queue for a separately authorized **simulated reviewer**. This restores a bounded demonstration of independent review from the original plan; it is not legal arbitration or a claim of Wise support functionality.
- Reviewer can request evidence, determine refund or allocation under the accepted demo policy, and record reasons and evidence considered. Cannot decide their own agreement. Owner allocation cannot exceed the owner's recorded requested amount or the reserved value; revised claims require explicit history and notification, not silent edits.
- Reviewer access is limited to assigned cases. Grants are administrator controlled. Normal users cannot self-promote.
- Insufficient evidence leaves the case `AWAITING_EVIDENCE` with a visible next action. Escalate overdue review for operations attention; never invent an automatic winner. A production service needs an authorized resolution body, service limits, complaints/appeals and a lawful route for unresolved funds.

### Deadline policies

All windows are disclosed in accepted terms, calculated from server UTC timestamps and displayed in local time. Defaults below are engineering/demo policies, not statutory rental rules.

| Situation | Trigger and default | Outcome |
|---|---|---|
| Invitation expiry | 24 hours after issue | Cannot claim; owner can reissue before funding |
| Incomplete funding | Accepted funding deadline | Cancel if unfunded; no penalty. Never activate without full funding |
| Security return review | First renter return declaration + 48 hours | Full renter refund unless timely owner dispute |
| No return declaration | Rental end passes | Flag overdue and allow escalation; no automatic owner payout/refund |
| Advance arrival review | Accepted arrival timestamp; confirmation deadline +48 hours | Student approves release or either side raises issue |
| Advance: no approval/no case | Confirmation deadline passes | Start 24-hour owner objection window, notify both; no owner release |
| Advance: no owner objection | Objection deadline passes | Full renter refund via background job |
| Advance: owner alleges successful handover/no-show | Before objection deadline | Open case; resolve with evidence, consent or demo reviewer |
| Negotiation stalls | 24 hours after case opening | Reviewer attention, not settlement by silence |
| Review remains unresolved | Review target exceeded | Alert operations, retain reserved state and show reason/next action |

A student may dispute before the arrival date if the listing becomes unavailable. The owner may also flag an advance issue before the deadline; a contested cancellation does not bypass review.

Security deposits: either party can cancel before activation for a full refund. Advances: either party can cancel before funding; after funding, an owner-agreed full refund is permitted, but disputed cancellation/no-show charges use negotiation/review. The MVP does not automatically debit cancellation penalties. Any future automatic fee policy needs explicit, valid terms and product/legal review.

Claims count only when committed with server time strictly before the applicable deadline. At exactly the deadline, expiry wins. A single row lock and shared deadline predicate prevent races among claims, approvals and jobs. A qualifying earlier dispute always blocks a later deadline job. Repeated jobs cannot reopen settled agreements or produce extra postings. Job delays show “refund due — processing”; they never extend claim eligibility.

## 6. Fraud safeguards and trust limits

- Authenticated membership, verified-email invitations, matching identity, token expiry/revocation, rate limits and server authorization. Email verification is not identity verification.
- For real deployment, verify identity and authority to rent/possess the asset; assess account risk, duplicate listings/asset identifiers and beneficiary changes. Prototype uses clearly labelled verification fixtures, not fake “Wise verified” badges.
- Preserve accepted listing snapshots, property/unit and equipment serial details. Owner identity alone does not prove authority or prevent double booking.
- Private, append-only submitted evidence; authorized short-lived downloads, size/type checks, and no public evidence URLs. Photos/timestamps do not prove authenticity, causation or ownership.
- Advance release is unavailable before arrival; require a deliberate renter confirmation showing amount and recipient. Warn against pressure to approve before inspection or to pay outside the protected flow.
- Freeze accepted parties, amounts, policy and payout identity after funding. No silent beneficiary substitution. Real payout verification and changed-account controls are production work.
- Audit every acceptance, submission, claim, decision and financial action. Reject replayed/idempotency-conflicting requests. UI states must not imply funds are released because a screenshot says they are.
- Independent review, abuse reporting and recorded reasons reduce unilateral control. Review itself can be abused or mistaken; preserve an honest unresolved state.
- Still exposed: coerced approvals, forged evidence, account compromise, collusion, stolen equipment, duplicate reservations, funding reversals and inability to prove physical facts. Production fraud and chargeback handling are not implemented.

## 7. MVP scope and experience

Required: one owner/renter per agreement; all three presets; immutable accepted terms; simulated single-currency funding; private evidence; baseline acknowledgements for security deposits; student arrival confirmation; 48-hour return review; advance timeout/refund policy; full and split settlements; disputes with messages/evidence; minimal assigned reviewer view; dashboard, timeline, receipts; server deadline processing.

Use one agreement detail page with purpose-aware sections, rather than three independent applications. Dashboard shows reserved totals separately by currency and next actions. An owner's reserved totals are never shown as spendable funds. Keep amount, recipient, purpose, deadline and required actor obvious on desktop and mobile. Provide loading, empty, permission, validation and recoverable-error states, keyboard access and readable status text.

Screens: sign-in/invitation; dashboard; preset-based agreement creation; shared detail/terms/funding; baseline and return/arrival evidence; claim/discussion/settlement; authorized reviewer queue/case; final receipt/history.

Deferred: group contributions/split sliders, representative consent, QR verification, marketplace search, rent collection, full leases, automated factual verification, AI adjudication, notification centre, external email reminders, native apps, real payment workers, real Wise API/auth, FX and legally binding arbitration. In-app next-action notices are sufficient for the demo; actual deadline notifications need delivery design before launch.

Cut visual polish, rich document previews and optional currencies before correctness. Do not drop a use case or weaken money/access rules silently. If reviewer UI slips, keep the honest unresolved-dispute path and mark reviewer resolution unfinished; never substitute owner-controlled decisions.

## 8. Architecture and data model

Retain the source plan's **Next.js App Router, React, TypeScript, Tailwind, Supabase Auth/PostgreSQL/private Storage, and Vercel** architecture. Exact dependency/API setup must be checked when implementation begins; this revision does not change or certify package versions.

```text
Shared UI / purpose presets
          |
Authenticated server actions / route handlers
          |
ConditionalPaymentService + validated policy guards
          |
Atomic PostgreSQL operations: state + ledger + audit
          |                         |
SimulatedPaymentProvider       Deadline worker / reviewer actions

Supabase Auth: identity; RLS: agreement/case access; private Storage: evidence
```

`PaymentProvider` exposes fund/settle/refund operations; only `SimulatedPaymentProvider` exists in MVP. No imagined Wise “escrow endpoint.” Keep future production provider operations asynchronous and reconciled when designed; local database atomicity cannot guarantee external transfer atomicity.

| Entity | Minimum data/responsibility |
|---|---|
| `profiles` | Auth ID, display name; no self-editable reviewer role |
| `agreements` | Owner/renter, current version, purpose, asset type, currency, amount, lifecycle, outcome, rental reference |
| `agreement_versions` | Immutable asset/listing snapshot, dates, payment purpose, default recipient, policy and deadlines, cancellation terms |
| `invitations`, `acceptances` | Token hash/expiry/revocation, intended identity, accepted version, actor and timestamp |
| `condition_records`, `acknowledgements` | Baseline versions, return/arrival records, exact-version acknowledgements, physical-access assertions |
| `evidence_files` | Private object path, uploader, phase/case, MIME/size, server timestamps; append-only after submission |
| `funding_records` | Funder, currency, amount, unique funding operation |
| `disputes`, `messages` | Case type, claim/requested allocation, reason, evidence references, status, response targets |
| `proposals`, `proposal_approvals` | Immutable complete split/reason, version, both approvals |
| `reviewer_grants`, `case_assignments`, `decisions` | Restricted authority, case access, rationale, evidence considered and decided split |
| `settlements`, `ledger_transactions`, `ledger_entries` | Unique final settlement, balanced simulated movements, operation IDs and receipts |
| `audit_events`, `deadline_jobs` | Actor/action/history, authoritative due time, deduplication and job success/failure |

Prefer extending compatible existing tables. Normalize mutable lifecycle separately from accepted terms. Derive all authoritative amounts and timestamps on the server.

Financial invariant per agreement:

```text
funded_minor = reserved_remaining_minor + renter_refunded_minor + owner_allocated_minor
final: reserved_remaining_minor = 0
all amounts >= 0; all postings use the agreement currency
```

Append-only balanced ledger; corrections use compensating entries. Scope idempotency keys to operation/actor and reject key reuse with changed payload. Unique funding and final settlement constraints prevent double execution.

RLS protects agreement tables; private storage checks membership or assigned case access. Deny ordinary client writes to balances, authoritative states, acceptance history and decisions. Critical mutations use a controlled transactional function with explicit actor checks; privileged functions require restricted grants, qualified names and safe search paths. Keep privileged keys out of browser code, logs and Git.

Use a bounded, retry-safe server scheduler, preferably existing Supabase Cron, to process return expiry, arrival stages, advance objections/refunds and review escalation. It runs with no browser open. Persist last success/failure and alert on stalled work. Re-check state and deadline under lock for every job. Polling/countdowns are presentation only.

Evidence: basic JPEG/PNG/WebP and PDF, initially up to 10 MB/file, with server-side type/content/size validation. Rich previews and HEIC conversion are optional. Preserve the source folder structure where possible: agreements, deposits, condition, disputes, shared domain/auth/Supabase helpers, migrations, controlled seed/reset scripts and focused tests.

## 9. Implementation milestones and team ownership

Retain the five-person structure as proposed assignments; team availability/acceptance is not verified by this document. Relative times start at the team's agreed kickoff, not at this file's creation.

| Owner | Main responsibility |
|---|---|
| Sameer | Schema/contracts coordination, ledger, atomic transitions, scheduler, invariants |
| Valera Murzin | Auth/invitations, version acceptance, purpose presets and agreement creation |
| Hayk | Shared shell/dashboard, funding and receipts, application integration and deployment |
| Tayma AlDabbas | Private evidence, asset-specific baseline/return, student inspection and listing comparison |
| Aiperi | Claims/messages/proposals, minimal reviewer view, deadline UI and demo coordination |

All workstreams use shared operation contracts and components. Merge small complete slices with build/type checks and relevant validation. Financial changes receive consistent review. Keep secrets outside version control.

| Milestone | Work and exit criteria |
|---|---|
| T+0–2: contracts/foundation | Inspect existing implementation; agree presets, states, policies, schema and fixture IDs. Confirm Auth/private storage/scheduler and first preview. Every team member can run the app |
| T+2–6: setup/funding | Create all three agreement presets, private invite, version acceptance, atomic simulated funding and permitted cancellation. Two authenticated users see one persisted agreement; strangers cannot |
| T+6–12: complete success flows | Integrate security baseline/activation/return/full refund plus advance arrival approval/owner payment. Receipts and timeline survive refresh; default security expiry runs without a browser |
| T+12–18: exceptions | Claim, evidence, immutable split and both approvals; minimal independent demo decision; advance non-response/refund and objection branch. Claim/expiry races pass. Freeze features at T+18 |
| T+18–22: verification/release | Focused domain/access/journey checks; mobile/keyboard basics; final storage/Auth/scheduler configuration; coherent fixtures and backup walkthrough |
| T+22–24: rehearsal/buffer | Rehearse independent sessions at final URL, fix blockers, retain last working deployment and submit |

Completion record: local foundation was previously recorded complete in the source plan and is not revalidated here. Unified schema, all product journeys, reviewer flow, security checks and deployment remain **pending verification**. This document revises planning only.

## 10. Required validation

- [ ] Both accept the exact version; edits reset approvals; funded terms/parties cannot change.
- [ ] Both security presets require funding and baseline acknowledgement before activation.
- [ ] Advance approval allocates to owner; security default expiry refunds renter. Purpose cannot be changed to invert recipients after funding.
- [ ] Early advance release, owner-only release and release while disputed are rejected.
- [ ] Return declaration starts one deadline; repeated submissions/uploads/acknowledgements do not extend it.
- [ ] Timely claim blocks expiry; exact-boundary and delayed-job checks use server time under the same lock.
- [ ] Advance no-response never pays owner automatically; no objection refunds; timely owner objection opens review.
- [ ] No-show, failed access, disputed receipt and overdue return have explicit next actions, without automatic forfeiture.
- [ ] €1,000 -> €920/€80 and €300 -> €275/€25 conserve value; zero/full allocations and odd cents work; negatives/overfunding/currency mismatch fail.
- [ ] Duplicate funding, approval, settlement and worker retries create one financial outcome. Concurrent cancel/fund or claim/expiry cannot duplicate or lose value.
- [ ] Stale proposal approval fails; rejection or silence in an open dispute never releases money.
- [ ] Stranger/wrong-email user cannot read agreement, invitation contents, ledger or files. Reviewer cannot access unassigned cases, self-assign privileges or decide their own agreement.
- [ ] Finalized evidence cannot be replaced; privileged keys are absent from client bundles/Git; private responses are not publicly cached.
- [ ] Background jobs work without browser sessions; failures/pending refunds are visible and retry-safe.
- [ ] A new browser session shows the same state/history/receipt. All three success paths and dispute branches work on deployed preview.

Prioritize meaningful financial, authorization, deadline and end-to-end checks over cosmetic UI snapshots.

## 11. Demo scenarios and presentation

Seed clearly labelled fixtures with coherent acceptance, evidence, ledger and audit history. Use independently signed-in owner/renter/reviewer accounts. Keep credentials out of the repository. Near-expiry fixtures use pre-established server deadlines and are explicitly described as accelerated examples; never expose a public clock override. Reset only allowlisted demo data in the dedicated environment.

| Scenario | Action | Expected result |
|---|---|---|
| Apartment deposit | €1,000; baseline and move-out evidence; no timely claim | Full €1,000 renter refund by deadline job |
| Equipment clean return | €300 camera deposit; owner approves refund | Full €300 refund using the same engine |
| Equipment damage | Owner requests €25 with receipt; renter accepts | €275 refund / €25 owner allocation |
| Apartment disputed deduction | €120 claimed; renter contests; agree €80 or reviewer decides | Restriction during dispute, then €920 / €80 with rationale |
| Student successful arrival | €600 advance; student inspects actual unit and approves | €600 owner payment; no continuing security-deposit balance |
| Student missing/misrepresented property | Student reports failed access with evidence | No owner payout; agreed or demo-reviewed €600 refund |
| Student non-response | No approval; confirmation and objection windows expire | Full refund; a timely owner objection instead opens dispute |
| Unresolved evidence | Reviewer requests documents | Funds remain simulated-reserved; next action is explicit |

Suggested five-minute live walkthrough: explain the remote student's problem and simulation boundary; open the three preset cards; show one accepted/funded student agreement and explicit arrival approval; show camera return and partial deduction; show apartment auto-refund on a near-due fixture; open a disputed failed-handover case and reviewer evidence view; close on the common timeline/ledger and pitch. Keep remaining cases as backup fixtures rather than attempting eight full live journeys.

## 12. Wise and production limitations

**Wise Deposit Protection is a proposed feature name, not an announced Wise product.** General Wise payment/balance APIs are not evidence that this escrow-like rental workflow is supported. The official developer guide distinguishes partner integrations from personal-token access; partner account setup describes jurisdictional eligibility and compliance approval. Integration design and commercial authorization remain unresolved. See [Wise developer guide](https://docs.wise.com/guides/developer) and [Wise partner account setup](https://docs.wise.com/guides/product/account-setup).

Wise's safeguarding descriptions concern protection of customer funds under the relevant service/entity arrangements; they do not by themselves establish authority to adjudicate rental disputes or implement this conditional-payment product. See [Wise's explanation of safeguarding for its UK entity](https://wise.com/help/articles/4IusAofIppsIGPcs7sEIXI/how-our-uk-entity-wise-payments-ltd-safeguards-customer-funds). These references were consulted for product boundaries, not as legal approval or evidence of Hungarian availability.

Before any real-money launch, obtain provider confirmation of the permitted custody/restriction/release model and duration, supported countries/currencies and roles. Commission jurisdiction-specific assessment of tenancy deposits, advance payments, consumer cancellation rights, identity/AML obligations, data retention, safeguarding, dispute authority and complaints. Determine whether a licensed custody/escrow partner is needed. No assumption of unlimited holds, interest treatment or automatic application of the prototype's 48-hour rule is acceptable.

Production also needs payment-webhook verification, provider reconciliation, failed/partial payout recovery, funding reversals/chargebacks, beneficiary verification, operational review staffing and escalation, reliable notice delivery, incident response and an authorized route to resolve outstanding funds. A local ledger flag cannot freeze a completed ordinary bank transfer. Never collect real payments into a developer account for this prototype.

## 13. Concise pitch

**Wise Deposit Protection brings one clear agreement to the money behind a rental.** Apartment tenants and equipment renters get transparent refundable deposits; students reserving a home from abroad can commit funds without releasing an advance before arrival and inspection. Owners see commitment and can document justified claims. One configurable conditional-payment engine connects terms, evidence, deadlines and fair settlement. The hackathon demonstrates the complete workflow with simulated funds; real-money delivery requires an authorized provider and regulatory model.

## 14. Revision provenance

Revised from the original **Pact — 24-hour hackathon implementation plan** backup and the later **Pact — Landlord–Tenant Deposit Implementation Plan**, together with the referenced “GitHub label organisation” conversation.

Preserved: existing stack/foundation, team structure, immutable acceptance, secure invitations, private evidence, integer ledger, atomic/idempotent settlement, dashboard/receipts, deployment and rehearsal schedule. Restored equipment support and a minimal simulated reviewer from the original plan. Retained the later housing plan's submission-triggered 48-hour rule and two-person MVP. Added protected advances with a different default recipient, explicit arrival approval, cancellation/objection handling, fraud safeguards and production authorization gates. Group deposits, QR flows and broader non-rental conditional payments remain deferred.
