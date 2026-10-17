# Pact: five-minute presentation and equipment backup

Owner: Aiperi. Handoff to Hayk for the final-origin rehearsal.

## Before presenting

Use `/` in the presentation browser. Keep the same origin throughout: agreement metadata is in localStorage and photos are in IndexedDB. A new browser or origin starts fresh. The role switcher selects fake actors, not authenticated users. Only one agreement is retained; creating another replaces it.

Reset the demo, then rebuild the apartment below. Have two small fake apartment photos and two fake camera photos available on disk, one baseline and one return per asset. Use Tayma's presentation photos when supplied; do not claim that those assets or final-origin rehearsal are complete until verified. Do not use personal addresses or genuine identity documents. Keep arrival inspection out of this walkthrough.

Use the [confirmed setup values](demo/setup-values.md). **Reset demo** loads the apartment example. For equipment, select **Landlord → New agreement → Equipment security deposit**; selecting the type loads the complete camera example. Values remain editable. Both examples use Maya Petrova / Luca Martin as fake actors and the same 48-hour, explicit-approval demo policy.

The apartment runs **1–17 October 2026**, with **€1,000** at **Fictional unit DEMO-18, Budapest**. The camera runs **16–17 October 2026**, with **€300** at **Fictional camera handover desk, Budapest**. Follow Tayma's [handover runbook](demo/handover-runbook.md) for the supplied baseline/return photos and checklist inputs. Complete every displayed checklist and upload the corresponding photo at baseline and return.

## Main path: five minutes

| Time      | Browser action                                                                                                                                 | Spoken script / expected state                                                                                                                                                                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:35 | Open `/` or reset. Review the landlord’s apartment preset and sample PDF; create the agreement.                                                | “At the end of a rental, people need to agree what was handed over, what came back, and how the deposit should be allocated. Pact makes those steps visible. This is a browser-local demo with simulated funds. It does not hold or protect money.”                                             |
| 0:35–1:10 | Show version 1 terms, the attached contract PDF and EUR 1,000. Switch to tenant, open the PDF, confirm review and accept.                      | “Creation records the landlord’s acceptance. The tenant accepts that same version before the landlord can publish condition evidence. The role switcher uses fake people.” Expected: awaiting baseline; EUR 0 reserved.                                                                         |
| 1:10–2:10 | Switch to landlord. Enter baseline identifier, notes, checklist and photo; publish. Switch to tenant and review and acknowledge that baseline. | “The landlord documents the starting condition after terms acceptance. The tenant approves this exact condition version before putting down a deposit.” Expected: awaiting funding; EUR 0 reserved.                                                                                             |
| 2:10–2:35 | Tenant funds using the simulated action. Open the ledger briefly.                                                                              | “Only after the condition review can the tenant fund the full deposit. Balanced demo entries reserve EUR 1,000 and activate the rental.” Expected: active; EUR 1,000 reserved.                                                                                                                  |
| 2:35–3:30 | As renter, enter return location, notes, checklist and return photo; submit the declaration. Show the displayed deadline and comparison.       | “The first return declaration fixes one 48-hour review deadline using the device clock. Here are the matching before and after records. Reloading does not restart that deadline. This demo has no background refund service.” Expected: return review; EUR 1,000 reserved.                     |
| 3:30–4:20 | Switch to owner, compare evidence, select **Release full deposit**.                                                                            | “The owner explicitly approves a full refund. This action completes the simulated settlement.” Expected: completed; renter refund EUR 1,000, owner allocation EUR 0, reserved EUR 0.                                                                                                            |
| 4:20–5:00 | Show ledger and activity, then reload.                                                                                                         | “The ledger records the refund and the reserved balance reaches zero. The activity shows who acted. State and photos remain in this browser after reload. Shared backend lifecycle, automatic expiry and independent review remain future work.” Confirm totals and saved evidence; close here. |

## Equipment backup: revision and explicit consent

Rebuild after reset using the camera inputs above, then repeat acceptance, photographed baseline, renter acknowledgement, simulated funding and photographed return. Do this before presenting the backup; creation replaces the apartment. Keep a recording of the verified backup with Hayk.

| Step / actor | Action                                                                                                                             | Expected display and explanation                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner        | Choose **Start dispute**, then propose EUR 25.00, reason: “Case mark shown in return photo; proposed case repair cost.”            | Version 1: renter refund EUR 275, owner allocation EUR 25; EUR 300 remains reserved. This is a proposal, not a deduction.                                                              |
| Renter       | Review version 1 and choose **Ask to revise**.                                                                                     | Owner acts next. EUR 300 remains reserved; there is no refund/allocation posting. “A request to revise does not settle funds or open a formal case.”                                   |
| Owner        | Choose **Start dispute** to revise, then propose EUR 20.00, reason: “Revised case repair estimate after reviewing the comparison.” | Version 2: renter refund EUR 280, owner allocation EUR 20. The revised proposal needs fresh renter approval.                                                                           |
| Renter       | Read version 2, both amounts and reason. Pause before approving; optionally reload.                                                | EUR 300 remains reserved while approval is pending. Silence does not count as consent and triggers no automatic settlement.                                                            |
| Renter       | Choose **Approve this split**.                                                                                                     | Completed: EUR 280 refund, EUR 20 owner allocation, EUR 0 reserved. Approval completes the demo settlement. Activity shows v1 proposal → revision request → v2 proposal → v2 approval. |
| Either       | Show ledger/activity and reload.                                                                                                   | Same totals, version 2 approval and evidence. Repeating settlement must not add postings.                                                                                              |

## Honest answers

- **Is this real money or Wise?** No. Funding, balances, refunds and allocations are simulated. No payment provider is connected to this walkthrough.
- **What if the renter does not approve?** Funds remain reserved in the local demo. There is no silent deduction or independent reviewer. Formal cases, messages and reviewer decisions are deferred.
- **What happens after 48 hours?** The displayed deadline uses the device clock. This demo provides no automatic expiry/refund worker; show explicit owner approval or mutual split approval.
- **Can another device see this?** No. Agreement metadata and photo files live in this browser and origin. The fake role switcher is not authentication. Separate authenticated setup exists but does not continue through this whole lifecycle.
- **Is a proposal final?** No. The renter must approve the current version. Asking to revise keeps the funds reserved; approving completes the simulated settlement.

## Reset, recovery and release handoff

1. Record the reviewed commit and final URL in Hayk's release notes. Prepare the photos on the actual presentation device.
2. Use the demo reset control; create the chosen agreement as owner and rebuild using the table. Resetting agreement state does not promise deletion of every stored photo; do not use sensitive evidence.
3. If a photo is missing, re-upload before publication/return. If saved state fails to reload or a total differs, stop rehearsal and report the exact step; do not claim persistence succeeded.
4. Rehearse the five-minute main path and equipment backup on the final origin at desktop and phone width. Confirm keyboard access, all expected amounts, photos after refresh, and unchanged return deadline.
5. Keep the last verified deployment and a short recording available. No hosted URL, supplied teammate photos, live rehearsal or recording is certified by this document.

Known dependency for Samir/Hayk: plan S1 describes a rejected proposal retained during a later full refund. The completion UI must use settled ledger amounts. The stale model proposal and saved-state validation still need S1 verification before release.

## Local verification: 17 October 2026

- `npm run check` passed: lint, TypeScript, formatting, 231 tests in 21 files and production build.
- The focused equipment negotiation browser rehearsal passed in installed Chrome against the production build at 1280px and 390px. Both runs confirmed pending EUR 300, version 2 consent, final EUR 280/EUR 20, reload and unchanged return deadline.
- Browser runs start from a valid return-review fixture. They do not upload or persist photo blobs and do not certify the full presentation or final origin. Unit/component coverage also checks ledger-based completion when a rejected proposal remains.
- Script is ready for Hayk; A3's final team rehearsal still requires Tayma's photos, the confirmed setup values and the final deployment. A4 remains deferred under the P0-first rule.
