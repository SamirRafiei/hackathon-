# Pact — 24-hour hackathon implementation plan

> Make a pact. Keep it fair.
>
> One link. One agreement. One protected exchange.

Status: local project foundation ready; product functionality not started.
Team: five people. Delivery window: 24 hours from team kickoff (T+0).
Repository: https://github.com/SamirRafiei/hackathon-
Local workspace: `C:\Users\Hamza\Desktop\Pact`.

Use this document as the shared build checklist. Check a task only when its completion criteria pass. Record changes to the agreed rules here before implementing conflicting behavior.

## 1. Product, positioning, and success criteria

Pact documents temporary exchanges between people who have already arranged a transaction. It connects agreement terms, group deposit contributions, condition evidence, handover, return, and dispute resolution.

**Pitch:** Pact is a proposed temporary-agreement and refundable-deposit layer for the existing Wise ecosystem. Show how the tool could fit naturally into that infrastructure and user experience while presenting a complete, standalone application.

**Hackathon reality:** Next.js and Supabase power the prototype. All payment, restricted-balance, deduction, and refund operations are simulated. No Wise API, Wise authentication, Wise account data, real payment rails, or actual money movement is required. Describe the Wise connection as the proposed product direction, not an existing integration or partnership. A small, consistent “Demo · simulated payments” label belongs beside money actions and in the demo introduction.

The delivery must demonstrate:

- [ ] One ordinary account can own one agreement and borrow in another; there are no separate owner/borrower account tiers.
- [ ] A separately authorized reviewer can inspect cases and record decisions.
- [ ] An owner creates an agreement, invites borrowers, negotiates revisions, and obtains everyone's acceptance of one immutable version.
- [ ] Multiple borrowers contribute their shares of one deposit in one currency.
- [ ] Fully funded agreements support documented, mutually confirmed QR/code handover.
- [ ] Any participating borrower can handle collection or return; the owner accepts the uploaded condition evidence.
- [ ] Return starts a 24-hour inspection period before automatic full refunds; the owner can authorize an early full refund.
- [ ] A timely damage claim blocks refunds and supports evidence, group negotiation, and reviewer resolution.
- [ ] Full refunds, proportional partial refunds, cancellation refunds, and complete history persist in the database.
- [ ] The deployed app looks and behaves like a finished product on desktop and mobile.

### Scope boundaries

Included: English; one item/property per agreement; one owner; one or more borrowers; EUR, USD, or GBP; optional rental-fee terms; copyable links; in-app status notifications; photos and supporting dispute documents.

Deferred: real Wise/payment integration, currency conversion, rental-fee collection, external reminder emails, marketplace discovery, identity checks, native mobile apps, legally certified signatures, and assigning damage liability to one specific borrower. Acceptance records are the MVP's digital acceptance mechanism.

Do not drop multi-borrower support, server-side money controls, private evidence, or either demo outcome to save time. Reduce animation, optional visual flourishes, and notification polish first. Any larger scope change requires an explicit team decision recorded here.

## 2. Team ownership and integration rules

| Person | Team member | Primary workstream | Owns |
| --- | --- | --- | --- |
| 1 | Sameer | Database and workflow foundation | Schema, migrations, RLS, atomic transitions, simulated ledger, money allocation, shared types, cron database routines |
| 2 | Valera Murzin | Identity and agreements | Auth/session setup, profiles, creation, invitations, revisions, acceptance |
| 3 | Hayk | Funding and shared product UI | App shell/design tokens, dashboard, contribution screens, ledger/history, currency formatting |
| 4 | Tayma AlDabbas | Evidence and physical exchange | Private uploads, photos/checklists, QR/code challenges, handover, return request and owner acknowledgment |
| 5 | Aiperi | Inspection and disputes | Inspection UI, claim/evidence submission, settlement negotiation, reviewer UI, job monitoring, end-to-end demo coordination |

Sameer is the integration coordinator for this sprint. Each owner also tests their own flow and integrates with adjacent workstreams. Aiperi coordinates the final rehearsal; everyone participates in final QA.

- [ ] Create one short-lived branch per workstream: `feat/core-ledger`, `feat/auth-agreements`, `feat/dashboard-funding`, `feat/handover-return`, `feat/disputes-review`.
- [ ] Merge the shared scaffold and schema/contracts before extensive feature work. All team members pull that baseline.
- [ ] Sameer owns schema migrations and generated database types. Others request additions rather than creating competing table definitions.
- [ ] Hayk owns global styles, navigation, and shared UI components. Others build against the same primitives.
- [ ] All financial/state-changing features call the shared domain operations; do not create independent implementations in page components.
- [ ] Merge small complete slices throughout the sprint. Integrate a first full path by T+12 and freeze features at T+18.
- [ ] Require a build/type check and a brief validation note before merging. Never commit credentials or demo passwords.

## 3. Agreed product rules

### Accounts, invitations, and revisions

- Normal account capabilities depend on membership in each agreement. The owner cannot also be a borrower in that agreement; borrower emails cannot repeat.
- Use Supabase email/password authentication. Provision demo accounts in advance so the presentation is independent of registration emails. Use verified email identity for real invitation matching; do not disable identity safeguards globally to simplify the demo.
- The owner enters a borrower email and deposit share for every slot and copies a separate, high-entropy invitation link for each person. No outgoing email is needed.
- Store invitation-token hashes, not raw tokens. Set an expiry (initial engineering default: 24 hours), support owner revocation/regeneration before funding, and prevent reuse to claim another slot.
- Require sign-in with the matching verified email before disclosing private agreement content or claiming the invitation. Preserve the invitation destination across sign-in. The public link page shows only generic invitation information.
- A borrower may propose edits. The owner publishes a revised immutable version containing the terms, currency, dates, participants, shares, policies, item details, and condition requirements.
- Owner and all borrowers must accept the exact current version. Revisions reset acceptance for everyone. Persist the accepted snapshot and acceptance timestamp, not just a mutable checkbox.
- No contributions until all participants accept. Once any contribution is secured, freeze the terms and membership. Changes then require cancellation/refunds and a new agreement.

### Deposit split and arithmetic

- One currency per agreement: EUR, USD, or GBP. No FX or mixed-currency ledger entries within an agreement. Rental fee, if recorded, uses that currency and is not collected.
- Use linked sliders plus accessible exact percentage inputs. Shares must sum to 100%; show each person's amount before acceptance. Use basis points internally (10,000 = 100%) and integer minor units for money.
- Every borrower must owe a positive amount. Reject deposits/splits too small to allocate at least one minor unit to each borrower. Validate sensible amount and participant limits centrally.
- Calculate contributions using the largest-remainder method with a stable participant-ID tie-break. Store the resulting amounts in the accepted version so UI and server never recompute differently.
- Each borrower funds only their own contribution. Handover requires the entire deposit to be secured.
- Deduct damage proportionally to the originally agreed shares, rounding deterministically and never beyond any person's secured contribution. Refund each person their own remaining amount. Owner allocation plus borrower refunds must equal the secured deposit exactly.
- Example: EUR 250, shares 60/40 -> contributions EUR 150/EUR 100. An EUR 80 deduction -> deductions EUR 48/EUR 32 and refunds EUR 102/EUR 68; owner allocation EUR 80.
- No platform fees in the MVP. Never use floating-point arithmetic for stored money.

### Collection, return, and inspection

- Any borrower can act for the group during collection or return; the accepted terms explicitly authorize this. Record who actually participated. All participants can see the resulting evidence.
- At collection, the owner and a borrower confirm the item identity, accessories, condition photos, and a short-lived QR/code challenge. The borrower acknowledges receipt and the owner confirms release/evidence before activation.
- At return, a borrower submits return photos/checklist and requests acknowledgment. Either side can initiate the workflow; a return is acknowledged only by the owner confirming physical receipt and the evidence.
- Owner acknowledgment of physical receipt starts the inspection clock; it is distinct from confirming that the item is undamaged. Persist `returned_at` and `inspection_deadline = returned_at + 24 hours` using server time.
- An owner may explicitly approve a full refund early. Otherwise, no timely claim by the deadline makes the deposit eligible for automatic full refunds.
- A claim recorded before the inspection deadline blocks release of the entire deposit, even if the scheduled expiry job runs at the same time. At or after the deadline, new claims cannot block automatic release. Compare timestamps under the same database lock.
- A return request unacknowledged for 24 hours goes to reviewer attention. Do not automatically assume receipt, start inspection, or release funds. The reviewer can resolve the receipt question with recorded evidence and reasons.
- Overdue return is a flag on the active agreement. It enables escalation and in-app alerts; it does not automatically forfeit the deposit.

### Claims, negotiation, and review

- The owner records a claim reason and requested deduction between zero and the secured deposit during the inspection window. Preserve its server timestamp. Initial evidence should accompany the claim; missing evidence is flagged for follow-up rather than silently deciding the case.
- Everyone can submit relevant photographs, receipts, invoices, explanations, and supporting documents. Reviewers have access to all relevant submitted documents, accepted agreement versions, condition records, and history for cases assigned to them. Evidence is not limited to the original condition photos.
- Allow additional evidence after the initial claim, including on reviewer request. The deadline governs opening the claim, not the end of evidence collection.
- A negotiated settlement requires explicit acceptance by the owner and every borrower. Any participant can propose a deduction amount with a reason. Changing a proposal resets its approvals.
- Rejection or no unanimous settlement within 24 hours of claim creation sends the case to reviewer attention. Silence is not consent and does not award money.
- Reviewer may request evidence, approve a full refund, or decide a deduction no greater than the owner's recorded claim or secured deposit. Record the policy basis, explanation, evidence considered, reviewer, and timestamp.
- Where evidence is insufficient, set `awaiting_evidence` and retain the restriction. There is no default winner or automatic payout for unresolved cases; show the next required action and elapsed time.
- A reviewer cannot decide their own agreement. Reviewer grants are configured by an administrator; users cannot grant themselves that role.
- Once a unanimous settlement or final reviewer decision is recorded, post all proportional refunds and owner allocations atomically. Completed settlements cannot be changed through ordinary UI actions.

### Cancellation and incomplete funding

- Any participant may cancel before handover; refund every contribution already secured. Cancellation by the owner or borrower applies to the entire agreement, not just one borrower slot.
- A processing contribution must be reconciled before cancellation completes. Locking/state checks prevent an in-flight simulated completion from securing money after cancellation.
- Failed contributions remain retryable with a new attempt; requests repeated with the same idempotency key return the original result.
- No automatic penalty for incomplete funding. Keep the agreement blocked and show the missing contributions; participants may cancel.
- After handover, use return/dispute workflows instead of unilateral cancellation.

## 4. User experience and Wise-inspired direction

Build a full Pact product that feels suitable as a tool within Wise. Retain Pact's name and tagline. Use clear balances, visible amounts and currencies, calm state explanations, and an obvious next action rather than a generic rental-marketplace layout.

- [ ] Establish a proposed palette: bright green primary actions (`#9FE870`), deep green text (`#163300`), warm light surfaces, clear warning/error colors. These are proposed implementation tokens; verify contrast before use.
- [ ] Use spacious layouts, confident headings, rounded buttons, restrained cards, simple icons, and prominent amount typography. Use an available open font such as Inter; no proprietary font dependency.
- [ ] Keep the persistent navigation simple: Overview, Agreements, Activity; show Review only to authorized reviewers. Put account controls in the same shell.
- [ ] Include a concise concept entry screen explaining Pact's proposed role in the Wise ecosystem. Do not add fake Wise account connections or nonfunctional banking controls.
- [ ] Build responsive phone and desktop layouts, keyboard-accessible dialogs/sliders, visible focus, meaningful labels, and status text that works without color.
- [ ] Every screen needs loading, empty, validation, permission-denied, and recoverable-error states. Explain whose action is needed, rather than showing only a status badge.
- [ ] Format currency everywhere with a shared formatter. Show contribution totals, each person's share, restricted amount, deductions, and refunds without ambiguity.
- [ ] Present accepted terms and before/after evidence together in the return and dispute views. Show the inspection deadline in local time plus a countdown derived from the stored UTC deadline.
- [ ] Use a private activity timeline for invitations, revisions, acceptances, contributions, handovers, return, claims, decisions, and refunds.

### Required routes/screens

| Route | Purpose | Primary owner |
| --- | --- | --- |
| `/` | Concept introduction and entry into Pact | Hayk |
| `/login`, `/signup` | Authentication and invitation continuation | Valera |
| `/dashboard` | Agreements, next actions, deposit summaries | Hayk |
| `/agreements/new` | Item, dates, terms, currency, borrower split | Valera |
| `/invite/[token]` | Secure invitation claim and review | Valera |
| `/agreements/[id]` | Shared overview, accepted version, activity | Hayk + Valera |
| `/agreements/[id]/funding` | Own contribution and group funding progress | Hayk |
| `/agreements/[id]/handover` | Condition photos, accessories, QR/code, confirmations | Tayma AlDabbas |
| `/agreements/[id]/return` | Return evidence, receipt confirmation, inspection status | Tayma AlDabbas + Aiperi |
| `/agreements/[id]/dispute` | Claim, documents, proposals, approvals | Aiperi |
| `/review` and `/review/[caseId]` | Assigned reviewer queue and evidence/decision workspace | Aiperi |
| `/activity` | User-visible agreement and transaction history | Hayk |

## 5. Technical architecture

Use a single Next.js application with App Router, React, TypeScript, Tailwind, and a small shared UI library. Use Supabase PostgreSQL, Auth, and private Storage. Deploy on Vercel. Resolve mutually compatible stable package versions at kickoff, pin them in one lockfile, and avoid upgrades during the sprint.

- Server Components load authorized data; Client Components handle forms, percentage controls, QR scanning, uploads, and interactive status.
- Use `@supabase/ssr` browser/server clients and the current documented session-refresh pattern. Verify identity server-side; do not trust user data from `getSession()` for authorization.
- Put domain operations behind authenticated Server Actions/Route Handlers. Each checks actor, membership, current version, payload, and transition. Layout checks and hidden buttons are not authorization.
- Critical mutations execute a single controlled Postgres function/RPC transaction. Do not assemble a financial operation out of separate HTTP inserts/updates.
- Keep client-readable tables under RLS. Deny direct client writes to balances, ledger, acceptance history, final decisions, and authoritative state fields. Route those mutations through controlled functions.
- Controlled `SECURITY DEFINER` functions, if required, must use a safe `search_path`, qualified table names, explicit caller checks, and restricted execute grants. Review for RLS bypass.
- Use Zod or an equivalent shared validation layer plus database constraints. The server calculates amounts, deadlines, and permissions.
- Keep payment behavior behind a `DepositProvider` interface with only a `SimulatedDepositProvider` implementation. Future Wise/provider work is outside this sprint and must not shape the prototype around unverified APIs.
- Poll active screens modestly and refresh after mutations. Realtime is optional polish; background deadline processing must work without any browser open.
- Use Supabase Cron to invoke bounded, retry-safe database routines every minute for inspection expiry and review escalation. Record job results and expose failures for team inspection.
- Use the same scheduler to create deduplicated in-app reminders before return deadlines (initial default: 24 hours and 1 hour beforehand, only when still in the future) and flag overdue returns. Persist notifications so closing the browser does not lose them.

### Suggested source layout

```text
src/app/                         routes, layouts, actions/handlers
src/components/ui/               shared controls and visual tokens
src/features/agreements/         creation, revisions, invitations, acceptance
src/features/deposits/           funding, formatting, simulated provider adapter
src/features/handover/           evidence, QR, collection and return
src/features/disputes/           claims, settlements, reviewer workspace
src/lib/supabase/                browser/server clients
src/lib/domain/                  shared schemas, transitions, operation contracts
src/lib/auth/                    identity and membership helpers
src/types/database.ts            generated database types
supabase/migrations/             ordered schema, RLS, functions, cron setup
supabase/seed.sql                non-secret fixtures only
scripts/                        development/demo provisioning and reset
tests/                          domain, authorization, integration and E2E tests
```

### Data model to finalize by T+2

| Entity | Minimum responsibilities |
| --- | --- |
| `profiles` | Auth user reference, display name; no editable reviewer flag |
| `reviewer_grants` | Protected reviewer authorization |
| `agreements` | Owner, currency, current version, lifecycle, authoritative timestamps, row revision |
| `agreement_versions` | Immutable item/terms/date/participant/share snapshot and policy version |
| `participants` | Agreement membership, borrower email/user, share basis points, allocated contribution |
| `invitations` | Participant/version binding, hashed token, expiry, claimed/revoked timestamps |
| `change_requests` | Borrower-proposed changes and owner's response/publication |
| `acceptances` | Actor and exact version, accepted timestamp; unique actor/version |
| `contributions` | Borrower allocation and funding status, secured/refunded/deducted totals |
| `payment_attempts` | Simulated processing/success/failure, operation key, immutable outcome |
| `ledger_transactions`, `ledger_entries` | Immutable balanced movements in agreement currency |
| `exchange_events` | Collection/return phases, actual actors, confirmations, item/accessory checklist |
| `verification_challenges` | Purpose, token/code hash, expiry, attempt limit, consumed timestamp |
| `evidence_files` | Private object path, uploader, phase/case, MIME/size/hash, timestamp and submission status |
| `disputes`, `review_cases` | Claim amount/reason, restriction, negotiation deadline, assigned reviewer, evidence requests |
| `settlement_proposals`, `proposal_acceptances` | Immutable deduction proposal and all-party approvals |
| `reviewer_decisions` | Final decision amount, reason, evidence references, reviewer, policy version |
| `settlements` | Single final disposition per agreement and per-borrower allocation |
| `audit_events` | Append-only actor/action/time/reference history, safe metadata |
| `notifications` | Participant-visible next-action/status notifications and read state |

Use UTC `timestamptz`, foreign keys, unique actor/version and operation constraints, and integer minor-unit amounts. State changes increment a row revision so stale forms cannot overwrite newer changes. Snapshot participant/share data in accepted versions even if membership records later change before funding.

### Lifecycle and authorization contracts

Maintain distinct agreement, contribution, and dispute states; derive human-readable deposit summaries from them instead of maintaining contradictory editable badges.

```text
Agreement:
draft -> awaiting_acceptance -> awaiting_funding -> ready_for_handover
      -> active -> return_requested -> inspecting -> settling -> completed

Before handover: -> cancelling -> cancelled (refund funded contributions)
From inspecting: -> disputed -> settling -> completed

Review flags/cases: overdue_return, unacknowledged_return,
                    negotiation_expired, awaiting_evidence

Contribution:
awaiting_payment -> processing -> secured -> refund_pending
                -> refunded | partially_refunded | allocated_to_owner
processing -> failed -> processing (new attempt)

Dispute:
negotiating -> in_review -> awaiting_evidence -> in_review -> resolved
negotiating -> resolved (unanimous settlement)
```

Map these to UI labels such as Awaiting payment, Payment processing, Deposit secured, Awaiting return, Refund pending, Refunded, Disputed, and Partially refunded. A group can contain both funded and unfunded borrowers; show this directly. A 100% deduction has an explicit owner-allocation outcome rather than a misleading “refunded” label.

Agree these operation names and request/response types before parallel implementation:

| Operation | Caller and required checks |
| --- | --- |
| `publishAgreementVersion` | Owner; no secured contributions; validated split; reset acceptance |
| `claimInvitation` | Authenticated matching verified email; valid unclaimed token/version |
| `proposeAgreementChange` | Participating borrower; not funded; no direct terms overwrite |
| `acceptAgreementVersion` | Owner/borrower; exact current immutable version |
| `startContribution` / `completeSimulatedContribution` | Own contribution; everyone accepted; valid attempt; not cancelled |
| `cancelAgreement` | Participant; no completed handover; reconcile attempts; refund atomically |
| `createVerificationChallenge` / `confirmHandover` | Owner/borrower; fully funded; purpose/expiry/replay/actor checks |
| `requestReturn` / `acknowledgeReturn` | Participant request; owner acknowledgment; submitted evidence; set inspection deadline once |
| `approveFullRefund` | Owner; inspection state; no open claim; settle once |
| `openClaim` / `submitEvidence` | Owner opens timely claim; participants/reviewer submit authorized evidence |
| `proposeSettlement` / `acceptSettlement` | Participants; current proposal; require all approvals |
| `recordReviewerDecision` | Assigned independent reviewer; reason/evidence/policy; amount limits |
| `processDueInspections` / `escalateDueCases` | Scheduler only; bounded batches; authoritative UTC time; idempotency |

Every mutation returns a typed success or a recoverable reason such as `stale_version`, `not_authorized`, `invalid_state`, `inspection_expired`, or `already_processed`. Never expose database internals or private membership details in public errors.

### Ledger and concurrency invariants

- [ ] Use balanced append-only ledger postings: borrower simulated source -> restricted deposit on funding; restricted deposit -> borrower refund/owner allocation on settlement. No real balances are implied.
- [ ] At all times, total secured equals restricted remainder plus cumulative borrower refunds plus cumulative owner allocation. Each transaction balances to zero in one currency.
- [ ] Lock the agreement row first, then related rows in a consistent order for payment completion, cancellation, claims, expiry, and settlement.
- [ ] Validate the complete transition, post entries, update aggregates, and append an audit event in one transaction.
- [ ] Use unique operation keys scoped to actor/operation; reject reuse with a different payload. Add a unique final settlement per agreement.
- [ ] Repeated clicks, retries, cron reruns, and concurrent claim/expiry requests cannot double-fund, double-refund, or release restricted funds.
- [ ] Simulate a visible processing stage with persisted attempts. A bounded worker/authorized completion operation advances due attempts; do not rely on a page timer for completion. Include a deterministic failure/retry fixture.
- [ ] For the simulated MVP, a final atomic settlement can record all refund/owner legs as successful together. Preserve processing/pending events in history; never mark completed before all legs succeed.

## 6. Evidence, QR verification, handover, and return checklist

Dependencies: shared auth client and membership helpers; private bucket/RLS; agreement and exchange-event schema; critical transition functions. Begin UI and uploader work against typed contracts while Sameer builds the RPCs.

- [ ] Build a reusable uploader for item, collection, return, and dispute evidence. Support mobile camera/file selection, thumbnails, progress, retry, removal before submission, and readable error messages.
- [ ] Start with JPEG/PNG/WebP photos (up to 10 MB each) and PDF dispute documents (up to 10 MB). Reject executable/HTML/SVG uploads; validate content and metadata server-side. Add HEIC conversion only if time remains.
- [ ] Keep one private bucket with agreement/phase/random object paths. Participants can upload only to their own authorized records; reviewers see assigned-case material. Use short-lived signed downloads created after access checks.
- [ ] Finalize upload metadata before allowing a confirmation. Submitted evidence is append-only; preserve original files and record additions instead of replacing accepted proof.
- [ ] Item identifiers/accessories must appear next to photos. Capture uploader, actual participant, phase, and server timestamp; do not claim device photo time proves when an image was taken.
- [ ] Generate a purpose-bound collection QR challenge only for funded agreements. QR opens the authenticated confirmation screen; it contains a random challenge reference, not private item data.
- [ ] Provide a manual code fallback for camera/permission problems. Initial defaults: 10-minute validity, one-use challenge, rate-limited verification, limited attempts. Hash stored challenge values.
- [ ] Require distinct owner and borrower confirmations. Scanning alone is not consent. Reject same-actor completion, stale challenges, wrong agreements, replay, and unfunded handover.
- [ ] Build return initiation and any-borrower evidence submission. Owner views the photos/checklist before acknowledging physical receipt. Aiperi owns inspection/claim actions after that acknowledgment.
- [ ] Integrate a return verification code where both parties are present; allow a documented remote return request that remains pending until the owner acknowledges it. Never require one designated lead borrower.
- [ ] Show inspection deadline and link to claim/refund actions after receipt, with shared records accessible to every borrower.

Done when: phone upload and desktop review work; QR and manual fallback work; replay is rejected; unauthorized users cannot access objects; any borrower can collect/return; owner receipt sets the deadline exactly once; evidence appears in Aiperi's review screen.

## 7. Implementation schedule and checkpoints

### T+0 to T+2 — Shared foundation

- [ ] Sameer + Valera: confirm repository write access for all five contributors; protect secrets and agree merge ownership.
- [x] Shared foundation: scaffold the Next.js TypeScript application in this repository, preserving `plan.md`; add one package manager/lockfile, lint/type/build commands, validation and test tools. Prepared with reserved team folders; product functionality remains unimplemented.
- [ ] Sameer: provision/select the team's Supabase project; record schema migrations; generate types; initialize local setup instructions.
- [ ] Valera: configure Auth, site URL, local/deployed redirect URLs, SSR clients and demo user provisioning.
- [ ] Hayk: land navigation, responsive shell, proposed design tokens, inputs/buttons/status/amount components, and one reference agreement screen.
- [ ] Entire team: freeze schema v1, operation contracts, states, ownership, and file conventions. Agree non-secret seed identities and fixture IDs.
- [ ] Sameer: set up Vercel project and first preview early, with environment variables and Auth redirects. Do not leave deployment discovery to the last hour.

Exit: every developer can start the app; preview loads; typed contracts are shared; auth, storage, cron availability, and repository access are known. Resolve setup blockers here.

### T+2 to T+6 — First vertical slices

- [ ] Valera: create/revise an agreement, borrower email slots, linked split controls with Hayk's primitives, and copyable invitations.
- [ ] Sameer: migrations, RLS, acceptance and allocation functions, atomic funding/cancellation foundations.
- [ ] Hayk: dashboard, agreement overview, per-borrower funding UI, processing/error states, timeline components.
- [ ] Tayma AlDabbas: private upload component, collection/return checklists, challenge screens and phone fallback.
- [ ] Aiperi: inspection view, claim form, evidence workspace, reviewer queue using the shared contracts.

Exit: owner can create and invite; borrower can authenticate and view their own invitation; unauthorized agreement/evidence access is denied. First integrated feature branches merged.

### T+6 to T+12 — Complete successful exchange

- [ ] Valera: all-party current-version acceptance and stale-version rejection; proposal/publication flow.
- [ ] Sameer + Hayk: simulated funding, deterministic splits, duplicate prevention, failed-payment retry, and pre-handover cancellation/refunds.
- [ ] Tayma AlDabbas: fully funded handover with photos, two-party confirmations, QR/manual code; active agreement and return acknowledgment.
- [ ] Aiperi + Sameer: early full-refund approval and scheduled expiry through one settlement operation; unacknowledged-return escalation.
- [ ] Hayk: accurate group deposit summaries and persisted transaction history.
- [ ] Hayk + Sameer: persisted due-date reminders, overdue flags, and status-change notifications with duplicate prevention.

Exit: on the deployed preview, two real signed-in users complete create -> accept -> fund -> handover -> return -> full refund. A second borrower can fund a separate share. No core screen depends on invented local-only state.

### T+12 to T+18 — Group disputes and complete integration

- [ ] Aiperi: timely claim and restriction, all-party proposal approval, rejection/escalation, supporting-document submission, reviewer evidence request and decision.
- [ ] Sameer: proportional deduction/refund allocation, settlement uniqueness, claim/expiry locking, authorization coverage.
- [ ] Tayma AlDabbas + Aiperi: collection/return comparison plus all relevant documents in the case workspace.
- [ ] Valera: verify invitation expiry/reissue, acceptance reset, frozen membership after funding, wrong-email handling.
- [ ] Hayk: multi-borrower balances, partial/full refund receipts, owner allocation, notification and history consistency.
- [ ] Entire team: integrate on preview and fix broken cross-workstream flows. Feature freeze at T+18.

Exit: both EUR 250 scenarios and the 60/40 group case work end to end; reviewer cannot access unrelated cases or decide their own exchange; cron runs are observable.

### T+18 to T+22 — Verification, polish, deployment

- [ ] Run the focused tests below; fix blockers before cosmetic improvements.
- [ ] Complete keyboard/mobile checks, empty/error states, permission messaging, screenshot and document readability.
- [ ] Verify production environment variables, Auth redirects, migrations, private bucket settings, cron scheduling and reviewer grants.
- [ ] Build and deploy the release candidate. Verify direct links and refresh behavior on deployed routes.
- [ ] Provision a controlled demo dataset and credentials outside Git; verify independent browser sessions.
- [ ] Prepare the pitch, screenshots, backup walkthrough, and a clear simulated-payments explanation.

### T+22 to T+24 — Rehearsal and submission buffer

- [ ] Rehearse the full demo on the final URL and actual devices. Avoid last-minute dependency/schema changes.
- [ ] Fix only submission/demo blockers; retain the last working deployment.
- [ ] Confirm repository, deployment URL, README, team attribution, screenshots/video, and required hackathon submission fields.
- [ ] Submit before T+24; reserve time for upload/permission failures.

## 8. Verification that must pass

Use meaningful tests around money, access, state, and complete journeys. Avoid spending the sprint on snapshot tests of simple components.

### Domain and database tests — Sameer

- [ ] Exact allocation: 60/40 split, three borrowers, awkward cents, deterministic rounding, very small deposit rejection, 0%/negative/non-100% share rejection, currency mismatch.
- [ ] Deductions: zero, EUR 80 of EUR 250, full deposit, odd-cent rounding; no borrower deduction exceeds contribution; sum is conserved.
- [ ] Funding requires every current-version acceptance; stale acceptance and frozen-term changes are rejected.
- [ ] Repeated payment/settlement keys return one outcome; key reuse with changed data is rejected.
- [ ] Concurrent payment/cancellation and claim/expiry operations preserve funds and produce one legal outcome.
- [ ] Re-running cron or settlement after completion cannot create new postings.

### Authorization and evidence tests — each owner, coordinated by Valera

- [ ] Stranger cannot read agreement, invitation details, files, ledger, or case by guessing IDs.
- [ ] Wrong-email user cannot claim a slot; expired/revoked token fails; token reuse cannot change membership.
- [ ] Borrower cannot pay for another borrower, approve owner receipt, open an owner damage claim, edit shares after funding, or set a reviewer flag.
- [ ] Owner cannot release a disputed deposit unilaterally; regular users cannot run scheduler or reviewer operations.
- [ ] Reviewer sees all relevant submitted case documents but cannot decide a case involving themselves.
- [ ] Private storage policies reject unauthorized listing/upload/download and finalized-file replacement.
- [ ] Wrong-purpose/expired/replayed codes and same-actor dual confirmation fail.

### End-to-end acceptance journeys — Aiperi coordinates

- [ ] Scenario A: Alex lends camera to Sam, EUR 250, three days; accept, fund, hand over, return, inspect/approve early, refund EUR 250, complete.
- [ ] Automatic expiry: stored deadline elapses without a claim; background job refunds without anyone opening the app. Test the exact cutoff and visible pending/complete behavior.
- [ ] Scenario B: timely EUR 80 claim; Sam rejects; funds remain restricted; documents are visible; later unanimous settlement or reviewer decision refunds EUR 170 and allocates EUR 80.
- [ ] Group scenario: EUR 250 at 60/40; separate matching-email invitations; both borrowers accept and fund; either can return; EUR 80 deduction yields EUR 102/EUR 68 refunds.
- [ ] Group consent: one borrower refuses a settlement; no release occurs until a permitted resolution.
- [ ] Revision: borrower proposes a change; owner publishes; all previous approvals reset; funding remains blocked until everyone accepts again.
- [ ] Cancellation after only one contribution: that person receives their exact contribution back; no unfunded person receives money.
- [ ] Non-response: unacknowledged return and expired negotiation create reviewer attention; unresolved evidence request keeps funds restricted.
- [ ] Refresh/new browser session shows the same authoritative state and history.

## 9. Demo data, clocks, and presentation

- [ ] Provision Alex, Sam, a second borrower, and an independent reviewer in the demo environment. Provision another owner/borrower-role example if needed to show one ordinary account supports both.
- [ ] Seed an unfunded camera agreement, an active agreement, a returned agreement near inspection expiry, and a disputed group agreement. Include camera photographs, accessories, and a plausible damage receipt/invoice.
- [ ] Use the same real workflow operations for the live path. Seed advanced states with coherent ledger/audit records rather than changing badges manually.
- [ ] Keep the normal policy at 24 hours. To demonstrate expiry quickly, use a separately labeled seed fixture with a pre-established near-due server deadline; do not expose a public clock override or pretend the live exchange waited 24 hours.
- [ ] Reset only allowlisted demo records in the dedicated demo project, through a privileged development script; never expose a reset control to ordinary users or run it during someone else's demo.
- [ ] Keep demo credentials in a team secret channel/environment, never committed to the repository or shown in screenshots.

Suggested five-minute walkthrough:

1. Explain the existing informal-exchange problem and Pact's proposed place within Wise.
2. Show Alex's agreement, one currency, participants, and the split controls; copy separate links.
3. Show Sam and the second borrower accepting the same version and securing their own contributions.
4. Show the funded balance, condition evidence, and QR/manual collection verification.
5. Show return receipt and the 24-hour inspection protection; demonstrate early refund or the near-due fixture.
6. Open the disputed fixture: compare before/after evidence and documents, show group consent or reviewer decision, then show proportional refunds and the audit trail.
7. Close with the value proposition and explain that financial movements are simulated; a real Wise integration is the future proposal.

## 10. Environment, release, and operational checklist

- [ ] Commit `.env.example` with names/placeholders only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`. Use the appropriate public key name for the selected Supabase setup consistently.
- [ ] Keep any Supabase privileged secret/service-role key in server-only deployment or provisioning environments. It must never appear in `NEXT_PUBLIC_*`, browser bundles, responses, logs, or Git.
- [ ] Prefer user-scoped Supabase calls with RLS. Restrict privileged provisioning and scheduler routines separately; cron does not need a public unauthenticated endpoint.
- [ ] Apply migrations reproducibly and document their order. Generate types after the final schema changes. Never silently rely on unrecorded dashboard edits.
- [ ] Set Auth site/redirect URLs for localhost and final deployment; test invitation continuation after sign-in on the deployed domain.
- [ ] Configure private buckets, MIME/size rules, file access policies, reviewer grants, and cron jobs in the release environment.
- [ ] Ensure authenticated agreement/evidence responses are not publicly cached. Keep participant data out of public analytics and error logs.
- [ ] Run dependency install, lint, type check, focused tests, and production build using documented package scripts.
- [ ] Verify HTTPS camera/file behavior on a phone; keep manual verification available for unsupported scanning.
- [ ] Check scheduler last-success/failure status and prove retries are safe. Show a truthful pending state if processing is delayed.
- [ ] README explains setup, commands, migrations/seeding, team assignments, known limitations, deployed URL, and the simulated financial model.
- [ ] Final Git diff and secret check pass; all demo-critical work is committed and pushed by the team; release URL is reachable by judges.

## 11. Risks and fallback actions

| Risk | Action |
| --- | --- |
| Five developers build incompatible screens/data | Shared schema, operation contracts, and design primitives by T+2; integration at T+6/T+12/T+18 |
| Multi-borrower arithmetic or consent bugs | Central integer allocation, immutable accepted split, all-party approval tests |
| Refund races with claims/cancellation | One locked database transaction per transition, idempotency and unique settlement |
| Auth/email delays during presentation | Preverified demo users, independent sessions, secure copyable links |
| QR camera unavailable | Manual code using the same server-side verification rules |
| Cron unavailable or misconfigured | Resolve at T+2; use a documented authenticated scheduled worker invoking the same bounded routine if necessary. No browser-only refunds |
| Reviewer cannot decide from evidence | Request additional documents; keep restricted and show a clear unresolved state |
| Storage/document preview takes too long | Reliable private image/PDF upload and authorized download first; rich preview later |
| App feels like disconnected hackathon screens | Shared shell, typography, green palette, amount/status components and one canonical agreement overview |
| Time pressure near submission | Feature freeze T+18; retain the working preview; cut cosmetic extras before correctness |

## 12. Engineering references

The architecture above is Pact's proposed implementation using the documented primitives; the services do not supply this agreement/ledger/dispute workflow automatically. Recheck version-specific setup when scaffolding.

- [Next.js authentication and per-operation authorization](https://nextjs.org/docs/app/guides/authentication)
- [Supabase SSR clients and identity verification](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Supabase database functions and function security](https://supabase.com/docs/guides/database/functions)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase private file downloads](https://supabase.com/docs/guides/storage/serving/downloads)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [PostgREST transaction behavior](https://docs.postgrest.org/en/stable/references/transactions.html)
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Wise Design: visual reference for the proposed product direction](https://wise.design/)

The personal `grill-me`/`grilling` skills were used to settle this plan and are installed outside this repository. Do not copy them into the app.

## 13. Completion record

Update this section as the sprint progresses.

| Checkpoint | Status | Evidence / blocker |
| --- | --- | --- |
| Plan and ownership agreed | Complete | Product rules agreed in planning; assignments recorded above |
| Local project foundation | Complete | Pinned dependencies, team folders, client factories, local Supabase config, CI, passing project checks and local page/style smoke check; no product features |
| Shared backend / first preview | Not started | Supabase project provisioning, schema/contracts, authenticated flows and Vercel preview remain team tasks |
| Successful exchange integrated | Not started | |
| Multi-borrower dispute integrated | Not started | |
| Security and money checks | Not started | |
| Release and rehearsal | Not started | |
| Hackathon submission | Not started | |
