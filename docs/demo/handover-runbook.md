# Evidence and handover runbook

Owner: Tayma AlDabbas. Scope: T1–T3 in [plan.md](../../plan.md). Fake actors, simulated funds, local browser data only. The 48-hour deadline uses the device clock; no automatic refund worker is connected.

## Prepare the presentation browser

1. Open the final demo URL and download the four [sample PNGs](../../public/demo-evidence/README.md) to the computer. Use the same origin/browser for the rehearsal and presentation. Do not upload personal files.
2. Open a fresh demo or choose **Reset demo** to start on the landlord creation form with editable apartment terms and the sample contract PDF. Review the PDF or attach a replacement (up to 10 MB), then choose **Create and accept version 1**. Creating the agreement records the owner's acceptance of version 1 and replaces the current browser agreement. Use the [confirmed setup values](setup-values.md); selecting the rental type loads the complete example.
3. Choose **Tenant**, open the agreement contract PDF, review the terms, check the acceptance checkbox and accept version 1.0. No deposit is reserved yet; the landlord can now publish the baseline.
4. Switch back to **Landlord** and use **Initial condition**. The table below supplies identifying details, captions, checklist notes and files. Check all four baseline items, then **Publish condition record**. The agreement contract was already attached during creation. The initial condition record accepts photos only; at least one condition photo is required. Publishing preserves all attached files and acknowledges that version as owner.
5. Reload. Confirm the image is visible and notes remain. Switch to **Tenant**. Review the condition photos and version, then choose **I acknowledge condition version 1**. Funding now becomes available, with €0 reserved. Choose **Simulate funding** for the full stated deposit; only then should the rental become active.
6. Open **Return declaration**, supply the return location and file, and complete the checklist as described below. Submit once. This records a statement and starts one deadline; it does not prove receipt or release funds.
7. Reload, reopen the return and confirm the displayed deadline is unchanged and the return photo is visible. Switch to **Landlord** and open **Before & after**. Compare both images/checklists; the reserved amount must still be unchanged.

## Apartment: unchanged condition and full refund

The local apartment baseline now starts with editable demo details: the agreement address, two keys, furnished-room inventory, an existing wall mark and completed draft checklist entries. Review/change these values as needed, upload your photos live and publish. No photos or acknowledgements are created automatically. The agreement summary appears first, followed by evidence, then the next-action and details cards. Existing published baselines remain unchanged.

Confirmed setup: **Apartment security deposit**, property **Fictional unit DEMO-18, Budapest**, **€1,000**, **2026-10-01 → 2026-10-17**. **Reset demo** and the apartment form use the same values. Keep the prefilled terms from the [setup reference](setup-values.md).

| Field                                 | Baseline                                        | Return                                                 |
| ------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Identifying details / return location | Unit DEMO-18; two keys                          | Fictional DEMO-18 handover desk; two keys returned     |
| General notes                         | Existing wall mark beside sofa; otherwise clean | Same wall mark; both keys returned                     |
| File                                  | `apartment-baseline.png`                        | `apartment-return.png`                                 |
| Caption                               | Synthetic demo: existing wall mark and two keys | Synthetic demo: unchanged wall mark; two keys returned |
| Rooms and surfaces inspected          | Checked; wall mark beside sofa                  | Matches baseline checked                               |
| Furniture and inventory recorded      | Checked; sofa included                          | Matches baseline checked                               |
| Keys and access devices counted       | Checked; two keys                               | Matches baseline checked                               |
| Existing damage documented            | Checked; same existing wall mark                | Matches baseline checked                               |

Comparison should show the same existing mark. Different written notes are observations, not evidence of new damage. Hand over to Hayk/Aiperi's script for **Release full deposit**. Expected money outcome: €1,000 renter refund, €0 owner allocation, €0 reserved. Do not wait for the 48-hour clock to expire.

## Equipment backup: case scuff and negotiation

Create a new agreement as **Landlord**, then select **Equipment security deposit**. This loads **Camera rental deposit**, **Fictional camera handover desk, Budapest**, **€300**, **2026-10-16 → 2026-10-17**, with equipment-specific terms. Keep those values for the backup.

| Field                                         | Baseline                                       | Return                                                              |
| --------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| Identifying details / return location         | Camera DEMO-CAM-001; battery and case          | Fictional camera handover desk                                      |
| General notes                                 | Camera works; battery and clean case included  | Camera works; cosmetic case scuff for discussion                    |
| File                                          | `camera-baseline.png`                          | `camera-return.png`                                                 |
| Caption                                       | Synthetic demo: camera, battery and clean case | Synthetic demo: cosmetic case scuff; equipment returned             |
| Serial number and identifying details checked | Checked; DEMO-CAM-001                          | Matches baseline checked                                            |
| Accessories counted                           | Checked; one battery, one case                 | Matches baseline checked                                            |
| Working condition checked                     | Checked; camera works                          | Matches baseline checked                                            |
| Existing damage documented                    | Checked; no case scuff                         | Leave unchecked; explain “New cosmetic scuff on case; camera works” |

Comparison should flag the unchecked exception and changed notes without deciding responsibility. €300 stays reserved. Hand over to Aiperi for owner **Start dispute** and proposal €25 → renter **Ask to revise** → owner **Start dispute** and proposal €20 → renter explicit approval. Expected final outcome: €280 renter refund, €20 owner allocation, €0 reserved.

## Reset and recovery

- **Start over:** use **Reset demo** to return to landlord creation with the apartment preset and sample PDF or create a new agreement with the inputs above. Reset clears agreement metadata, not all previously stored IndexedDB blobs. Reattach the original sample files; old uploads are not automatically reused.
- **One scenario at a time:** creating equipment replaces the current apartment record. Keep the inputs and downloaded files ready. Do not expect a scenario library or shared state between browsers.
- **Upload failure:** check file format/size and browser storage permissions, then **Retry upload**. Stay in the same actor/view until the upload finishes. A draft upload is not a published record and may need re-uploading after leaving the form.
- **Preview failure:** **Retry preview** first. If a draft's local file is missing/corrupt, remove the draft and upload the original sample again. Submitted records cannot be silently replaced; for this fake-data walkthrough, reset/create the agreement and rebuild it. Inability to view a file does not cancel acknowledgements or establish damage.
- **Baseline correction:** before funding/activation, the owner can **Create a new condition version**, upload fresh photos and publish it. Only the current version can be acknowledged. Once active, the baseline is locked.
- **Arrival inspection:** keep this outside the main script. If asked, explain that it records inspection only and does not convert the deposit into an advance or release an owner payment.

## Handoffs and verification

Aiperi receives the comparison story and equipment exception above. Hayk receives these exact files/inputs for the final-origin rehearsal and his full-settlement browser tests. Valera’s shared example defaults and setup reference define the confirmed values; Samir owns shared money/state changes. No teammate messaging or deployment is performed by this runbook.

Run Tayma's focused browser checks with `npx playwright test tests/e2e/handover-evidence.spec.ts --workers=1`. They cover desktop (1280 px) and phone width (390 px), real IndexedDB blobs across reloads, keyboard-operated handover controls, consent guards, exact return deadline, matching before/after images and corrupt-file recovery. They stop at return/comparison; full settlement and final deployed-origin rehearsal remain separate release work.
