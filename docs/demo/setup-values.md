# Confirmed demo setups — Valera V1

The setup form and reset apartment share `src/features/demo/agreement-presets.ts`. The presentation script and evidence runbook use these values. These are fictional examples; no invitation, real identity, payment, automatic refund, or independent dispute service is provided by the local walkthrough.

| Field          | Apartment main path                                                          | Equipment backup                                                                                           |
| -------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Rental type    | Apartment security deposit                                                   | Equipment security deposit                                                                                 |
| Agreement name | Apartment security deposit                                                   | Camera rental deposit                                                                                      |
| Location       | Fictional unit DEMO-18, Budapest                                             | Fictional camera handover desk, Budapest                                                                   |
| Dates          | 1–17 October 2026                                                            | 16–17 October 2026                                                                                         |
| Deposit        | €1,000.00                                                                    | €300.00                                                                                                    |
| Owner / renter | Maya Petrova / Luca Martin, fake demo actors                                 | Same fake demo actors                                                                                      |
| Inventory      | Two keys and listed apartment inventory                                      | Camera DEMO-CAM-001, battery and case                                                                      |
| Review         | First photographed return starts one 48-hour deadline using the device clock | Same                                                                                                       |
| Settlement     | Explicit full refund: €1,000 renter / €0 owner / €0 reserved                 | Propose €25, renter requests revision, propose €20, renter approves: €280 renter / €20 owner / €0 reserved |

## Loading and acceptance

- A fresh visit or **Reset demo** opens the landlord creation form with apartment preset terms and its demo contract PDF. No agreement has been submitted yet. Saved agreements resume after refresh.
- **Landlord → New agreement** opens the same setup again after an agreement exists, without authentication or Supabase.
- Changing rental type loads that example’s complete sample values, including title, location, dates, amount, terms and contract PDF. Edit them before submission if needed.
- **Create and accept version 1** records the owner's acceptance and replaces the current browser agreement. It does not accept for the renter.
- A contract PDF is required at creation. Keep the marked demo PDF or attach your own PDF of up to 10 MB; failed/pending uploads block creation. The tenant can open it before acceptance, including after reload in the same browser.
- **Tenant** reviews the terms and attached contract PDF, checks the acceptance box and accepts the same version. The landlord can then publish the condition baseline.
- The tenant reviews and acknowledges the published baseline before funding becomes available. No funds are reserved during baseline review; full simulated funding activates the rental. Use the four synthetic images and checklist inputs in [the handover runbook](handover-runbook.md).
- On return review, the owner selects **Release full deposit** or **Start dispute**. A split proposal needs explicit renter approval; silence does not settle funds.
- Account setup is deferred; no preview link appears in the local demo.

## Exact prefilled terms

### Apartment

EUR 1,000 refundable security deposit for fictional unit DEMO-18. Return both keys and listed inventory in the acknowledged condition. The first photographed return declaration starts one 48-hour review using the device clock. Any deduction requires mutual agreement. This is a browser-local simulation; automatic refunds are not connected.

### Equipment

EUR 300 refundable security deposit for camera DEMO-CAM-001, battery and case. Return the camera and listed accessories in the acknowledged condition. The first photographed return declaration starts one 48-hour review using the device clock. Any deduction requires mutual agreement. This is a browser-local simulation; automatic refunds are not connected.

## Validation and handoff

Dates must be valid and end after start. Deposit range is €1–€1,000,000 with at most two decimal places; fractional cents are rejected rather than silently rounded. Name, rental location and at least ten characters of terms are required. Only the owner demo identity can create an agreement. Visible errors retain entered values for correction.

This document supplies Aiperi's script values and Hayk's rehearsal inputs. Final deployed-origin rehearsal remains their release task; it is not claimed by this handoff. Existing browser saves retain their own accepted values until the presenter resets or creates a new agreement.
