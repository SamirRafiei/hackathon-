# Pact — demo delivery plan

Updated: 17 October 2026. Based on the code at `43c2731` on `main`.

**Goal: deliver one reliable five-minute rental-deposit demonstration using what already works.** Finish and rehearse the browser-local flow before adding backend features. This replaces the requirement to demonstrate three complete product journeys and independent review within the hackathon.

**Demo boundary:** All funding, reserved balances, refunds and owner allocations are simulated. Show “Demo — simulated funds” beside financial actions. The role switcher selects fake actors; it is not authentication. Agreement metadata lives in localStorage and photos in IndexedDB in one browser. No real money, financial protection, Wise integration, identity verification or independent adjudication is provided.

The broader product proposal, reservation-advance rules and production requirements are preserved in [the archived full product plan](docs/plans/full-product-plan.md). They are future work, not requirements for this demo.

## 1. Smallest complete demo

Use the existing `/` walkthrough as the presentation entry point. One owner, one renter, EUR, one current agreement in the browser. Demonstrate both outcomes using the same workflow:

| Scenario | Walkthrough | Required result |
| --- | --- | --- |
| Main: apartment, €1,000 | Review terms → renter accepts → simulated funding → owner publishes photographed baseline → renter acknowledges → active rental → renter submits photographed return → compare condition → owner approves full refund | €1,000 renter refund, €0 owner allocation, €0 reserved; ledger and activity survive reload |
| Backup: equipment, €300 | Create camera agreement → same acceptance/handover/return steps → owner proposes €25 with a reason → renter asks to revise → owner proposes €20 → renter explicitly approves | €280 renter refund, €20 owner allocation, €0 reserved; proposal revision and consent are visible |

Owner creation already records the owner's acceptance of version 1. Make that consequence clear on the create action. Baseline publication records the owner's acknowledgement; activation still requires the renter's acknowledgement of that exact baseline.

Use the full-refund branch live. Keep equipment negotiation as a rehearsed backup or show it if time allows. Creating an agreement replaces the browser's current agreement; a multi-agreement dashboard is outside this release. Use prepared sample photos and a written reset/rebuild procedure rather than building a scenario manager.

The 48-hour review deadline remains visible and fixed after the first return declaration. It uses the device clock in this demo. **Do not wait for expiry, promise automatic refunds, or add a pretend background worker.** The demonstrated outcome is an explicit owner-approved refund or mutually approved split.

The existing arrival inspection is reusable exploratory UI. It does not create a reservation advance or approve an owner payment. Keep it out of the main walkthrough; label it clearly if it remains visible.

## 2. What is already complete

These are code capabilities, not proof of hosted operation or attribution of every commit to an individual. Owners below are the delivery assignments for this plan.

| Workstream / owner | Existing implementation to keep | Actual limit |
| --- | --- | --- |
| Tayma AlDabbas — evidence and handover | Photo validation/upload/preview; IndexedDB storage; versioned baseline/acknowledgements; photographed return; before/after comparison; arrival inspection. Authenticated private-download endpoint/helper in `43c2731` | Main flow is browser-local. Download endpoint needs Supabase evidence records/objects; secure upload gateway and hosted verification are unfinished |
| Samir — domain and money | Integer allocation helpers; ledger/constraint/RLS migrations; simulated funding/cancellation RPCs and adapter; database tests. Local funding, refund, split and lifecycle guards | Backend rental lifecycle is unfinished; local transitions are not server authority. Earlier docs call this workstream “Sameer” |
| Aiperi — negotiation experience | Shared demo already has reasoned split proposals, versions, renter approval/revision request, pending reserved funds and activity history | `src/features/disputes/` has no implemented case/reviewer logic. Formal disputes, messages and reviewer decisions are incomplete |
| Valera — setup and acceptance | Local apartment/equipment creation; Supabase sign-in/sign-up, hashed invitations, verified-email claiming, exact-version acceptance and server actions | Authenticated setup is separate; its agreement page does not continue into the full rental/payment lifecycle |
| Hayk — application and presentation | Shared shell, branding, role switcher, reserved balance, next action, timeline, ledger and reset | Shared persistent dashboard/receipts/funding are not connected; final deployment/rehearsal is not established by code |

Baseline local verification at `43c2731`: **229 tests across 20 files passed**, plus TypeScript, lint, formatting and production build. There were no browser journeys at that checkpoint. Tayma’s subsequent evidence checks and handoff are recorded below; Hayk’s complete settlement journeys and final-origin rehearsal remain open. Hosted Supabase and shared independent-browser operation have not been verified. Do not rebuild completed modules.

## 3. Priority rules

- **P0 — demo blocker:** complete before release. Fix incorrect outcomes, broken transitions, persistence failures on the supported browser, and unrehearsed presentation steps.
- **P1 — optional:** start only after P0 checks pass on the release candidate. Cut these first if time is short.
- **Deferred:** backend expansion and broader product features. Preserve existing code without making them presentation dependencies.

Checked tasks have evidence recorded in their workstream notes. Earlier unit tests do not mark a browser/deployment check complete. If verification finds no defect, record the check instead of redesigning the feature.

## 4. Tasks by person

### Tayma AlDabbas — dependable evidence and handover

Already complete: all five handover modules and private downloads. Keep those implementations.

- [x] **T1 / P0 — verify photo persistence.** For apartment and equipment: upload sample photos, publish baseline, switch actors, acknowledge, reload and confirm files/checklists remain. Submit a return and reload again. Missing photos need an understandable retry/re-upload next action. Coordinate storage failures with Samir/Hayk; fix blockers found.
- [x] **T2 / P0 — verify consent and comparison.** No activation before funding and both acknowledgements; no routine return before activation. Baseline revision resets acknowledgement. Comparison uses the matching baseline/return. Reload, viewing and acknowledgement cannot move the first return deadline. Add focused tests for defects found.
- [x] **T3 / P0 — prepare the presentation evidence.** Supply small fake apartment/camera photos and checklist inputs. Check upload, preview, return and comparison at phone width and with keyboard navigation. Keep arrival's “no payment released” explanation clear.
- [x] **T4 / P1 — improve a specific upload/preview recovery issue found in rehearsal.** No new storage provider.

**Handoff:** give Aiperi comparison evidence and Hayk the sample photos/reset instructions. Secure Supabase upload/finalization moves to the post-demo backlog.

**Local completion checkpoint:** T1–T3 verified with six Chromium browser checks: apartment/equipment at 1280 px and 390 px, baseline revision, corrupt-photo recovery, actual IndexedDB blobs after reload, consent/deadline guards and keyboard-operated controls. T4’s discovered decode-error gap is fixed with filename, retry and safe recovery instructions. The four synthetic PNGs and exact checklist/reset inputs are in the [handover runbook](docs/demo/handover-runbook.md). This does not complete final deployed-origin rehearsal or Hayk’s settlement tests. See [implementation notes](src/features/handover/IMPLEMENTATION.md) for validation evidence.

### Samir — correct financial outcomes and state

Already complete: domain/database foundations, funding/cancellation groundwork and local settlement transitions. No schema rewrite for this release.

- [ ] **S1 / P0 — fix full refund after a rejected split.** `declineSplit` retains the proposal and `approveFullRefund` also retains it in `src/features/demo/model.ts`. Completion UI uses that proposal to display allocations. Reproduce “nonzero proposal → ask to revise → full refund”; clear or explicitly supersede the stale proposal so summary, ledger and history all show the full refund. Add a regression test.
- [ ] **S2 / P0 — verify local money and consent guards.** Check €1,000 full refund, €300 → €280/€20, odd cents, zero/full allocations, rejection, revised proposals and repeat clicks. Funds stay reserved before consent and reach zero exactly once after settlement. Reject funding before acceptance, allocations above reserved value and invalid-state settlement. Add tests for gaps found.
- [ ] **S3 / P0 — verify saved state.** Rehearse reload after funding, return and settlement. With Hayk, surface storage-write failure: the UI must not promise changes were saved when persistence failed. Do not claim server/concurrency guarantees for localStorage.
- [ ] **S4 / P1 — document the next backend integration seam.** List available funding/cancel RPCs and missing handover/settlement operations; no new worker or lifecycle migration now.

**Handoff:** own shared model/repository changes. Agree the settlement outcome shape with Aiperi/Hayk before changing consumers. **S1 is the first concrete code fix.**

### Aiperi — clear negotiation and presentation

Already available: shared proposal/revision/approval controls. Reuse these rather than creating a second implementation.

- [ ] **A1 / P0 — rehearse equipment negotiation.** Owner proposes €25 with reason; renter asks to revise; €300 stays reserved; owner publishes €20 proposal; renter sees current version, €280 refund and €20 allocation before approving. Revised amounts require fresh approval; activity explains the sequence.
- [ ] **A2 / P0 — make pending status and finality clear.** Show who acts next after rejection/pending approval; silence keeps funds reserved. Do not imply a formal case, real-money deduction or independent reviewer exists. Coordinate completion rendering with S1/Hayk.
- [ ] **A3 / P0 — write the five-minute script.** Cover problem, simulation boundary, accepted terms, evidence, explicit refund and ledger. Include the equipment backup and honest answers about absent backend automation/review. Rehearse with Tayma's photos and Valera's values.
- [ ] **A4 / P1 — fix a specific negotiation usability problem found in rehearsal.** No chat, case management or reviewer dashboard.

**Handoff:** give Hayk the final script and expected amounts/status at each step. Formal claims/reviewer implementation is deferred.

### Valera — quick and unambiguous setup

Already complete: local creation and separate authenticated setup/claim/acceptance. Full Auth integration is outside the presentation scope.

- [ ] **V1 / P0 — prepare both local setups.** Apartment €1,000 and camera €300, coherent dates/location/terms, 48-hour review rule and fake parties. Make creation-as-owner-acceptance clear; renter reviews that version before funding.
- [ ] **V2 / P0 — verify local form boundaries.** Required fields, invalid dates/amounts and owner/renter actions produce useful errors. Fix equipment labels where housing-only copy confuses the walkthrough. Fix presentation blockers only.
- [ ] **V3 / P0 — keep the entry path clear with Hayk.** Main call to action reaches the local walkthrough. No required step leads into the separate account flow; label account-flow links as a separate preview.
- [ ] **V4 / P1 — smoke-test existing Auth if configured.** Verify sign-in/invite/acceptance without expanding it. Supabase availability must not block the main demo.

**Handoff:** give Aiperi setup values and acceptance wording. Coordinate shared validation with Samir. Defer revisions and invitation-management expansion.

### Hayk — integration, verification and release

Already complete: shell/branding, role switch, balance, timeline, ledger and reset. Reuse these; no new dashboard or receipt-export system.

- [ ] **H1 / P0 — align summary and next-action UI.** After S1, final allocations match ledger entries for full refunds and splits. Check loading/error states and simulated-funds labels. With Valera preserve local entry; with Samir display persistence failures clearly.
- [ ] **H2 / P0 — add two Playwright journeys.** Apartment full refund and equipment revision/approved split, using sample uploads. Assert activation guards, photo/state reload, pending reserved value and final totals. Cover rejected-split → full-refund regression where practical. Reuse fixtures; avoid cosmetic snapshots.
- [ ] **H3 / P0 — deploy and smoke-test one preview.** Run `npm run check` and browser journeys; deploy that reviewed commit and record URL/commit. `/` works without Supabase credentials. Verify role switch, uploads, refresh, reset and phone-width layout on the final origin. Local evidence does not transfer between origins.
- [ ] **H4 / P0 — lead rehearsal and prepare fallback.** Rebuild both scenarios on the presentation browser from Tayma/Valera's inputs; rehearse Aiperi's script. Keep the last working deployment and a short backup recording. A new browser starts fresh; do not promise cross-device synchronization.
- [ ] **H5 / P1 — fix specific readability/overflow problems found in rehearsal.** No redesign.

**Handoff:** own `demo-workspace.tsx`, shared styles, Playwright integration and release assembly. Teammates provide module fixes; avoid simultaneous edits to shared files.

## 5. Execution order and dependencies

| Order | Work | People | Exit condition |
| --- | --- | --- | --- |
| 1. Freeze inputs and fix outcome | Prepare photos/values/script outline; fix stale proposal | Tayma T3, Valera V1, Aiperi A3, Samir S1 | Same amounts/actions/wording; rejected split cannot corrupt refund summary |
| 2. Verify existing flows | Guards, persistence, evidence consent, setup and negotiation | Samir S2–S3, Tayma T1–T2, Valera V2, Aiperi A1–A2; Hayk H1/V3 | Both paths complete locally with correct summaries and reload behavior |
| 3. Check integration | Finish H1; add H2; run quality checks | Hayk integrates; module owners resolve failures | Release candidate passes checks; no P0 defect remains |
| 4. Release and rehearse | Deploy, verify final origin, rehearse and retain fallback | Whole team; Hayk coordinates H3–H4 | Known working URL/commit and five-minute presentation |

Do not start P1 before step 3 passes. If time is tight, cut P1, the live equipment branch and account-flow presentation first. Keep equipment as a tested backup. Do not cut correctness, persistence checks, simulation disclosure or final-origin rehearsal.

## 6. Demo release checklist

- [ ] Main `/` walkthrough opens at the final URL without credentials or setup surprises.
- [ ] Accepted terms are required for funding; funding and exact-baseline acknowledgements are required for activation.
- [ ] Photos/checklists and agreement state survive refresh on the presentation browser.
- [ ] First return fixes one displayed deadline; copy does not imply an automatic refund service exists.
- [ ] €1,000 full refund, including after a rejected split, displays €1,000/€0 with zero reserved.
- [ ] €300 negotiation revision settles €280/€20 only after renter approval; rejection/silence keeps €300 reserved.
- [ ] Repeat settlement actions do not add extra local postings; ledger/history and completion display agree.
- [ ] Fake identity, local storage and device-clock limits are clear; no live Wise/reviewer claim appears.
- [ ] `npm run check` and both Playwright journeys pass; final-origin desktop/mobile rehearsal is complete.
- [ ] Reset/rebuild instructions, last working deployment and backup recording are ready.

Passing this checklist means **demo-ready under this reduced scope**. It does not mean the broader MVP or production service is complete.

## 7. Post-demo backlog

| Deferred work | Future lead / support | Reason to defer |
| --- | --- | --- |
| Authenticated upload preparation, content/hash verification, finalization and safe draft deletion | Tayma + Samir; Valera supports sessions | Local photos already demonstrate the experience; next substantive backend evidence slice |
| Shared baseline/return records, server timestamps and rental/settlement RPCs | Samir + Tayma; Hayk integrates | Requires coordinated authoritative lifecycle work |
| 48-hour automatic refunds, claim/expiry locking and monitored no-browser jobs | Samir | Demo uses explicit approval; no pretend automation |
| Reservation-advance preset/purpose schema, arrival payment and non-response/refund policy | Valera + Samir + Tayma + Hayk | Arrival inspection alone is not the payment journey |
| Formal claims, messages, case proposals, assigned reviewer decisions and escalation | Aiperi + Samir | Local negotiation shows consent without inventing independent review |
| Authenticated funding/dashboard/receipts, cross-browser sync and hosted access/concurrency checks | Hayk + Valera + Samir | Preserve separate setup; full shared integration is a later milestone |
| Corrections/republication, invitation revoke/reissue, notices and broader cancellation | Valera + Samir | Version-one fixtures are sufficient for presentation |
| QR, groups, extra currencies, rich formats, exports and redesign | Unassigned | Adds breadth without completing the two outcomes |
| Live payments/Wise integration, reconciliation, identity/authority verification and legal/operational readiness | Separate production planning | Prototype cannot hold or protect real funds |

Preserve backend code/tests. Private downloads are implemented; hosted verification and full gateway integration remain future work. Resume the archived product requirements explicitly when expanding scope, including advance-specific consent and timeout safeguards.
