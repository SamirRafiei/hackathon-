# Handover implementation checkpoints

Owner: Tayma AlDabbas. Coordination and shared contracts: main implementation agent.

Follow the current `plan.md`: one owner/renter, local apartment/equipment demo, a fixed displayed 48-hour security review from the first renter return declaration, explicit approval for settlement and QR deferred. Server automation and authenticated upload expansion are post-demo work. No product/payment scope is changed by this workstream.

| Module        | Scope                                                                  | Status                          |
| ------------- | ---------------------------------------------------------------------- | ------------------------------- |
| `evidence/`   | Validated uploader, preview/download, storage adapter boundary         | Implemented; focused tests pass |
| `baseline/`   | Asset checklist, immutable baseline versions, two-party acknowledgment | Implemented; focused tests pass |
| `returns/`    | Return declaration tied to baseline, one review deadline               | Implemented; focused tests pass |
| `comparison/` | Baseline/return evidence and checklist comparison                      | Implemented; focused tests pass |
| `arrival/`    | Accepted-listing comparison and renter inspection                      | Implemented; focused tests pass |

Only the coordinator changes `contracts.ts`, application integration, shared styles, package files, or existing domain/schema files. Each module owns its tests. No agent independently commits, pushes, installs dependencies, or edits another module.

The existing interactive app is a browser-local simulation with fake actors. Demo attachments must be explicitly labeled local and must not pretend to be private multi-user Supabase storage. Production evidence adapters require authenticated server preparation/finalization and authorized private downloads; existing metadata/RLS alone are not a complete upload workflow.

Integration checkpoint: all five modules are implemented and their focused tests pass. The existing browser demo is wired through `handover-workspace.tsx`, persists record metadata in the agreement snapshot and actual files in IndexedDB. The integrated project checks pass (205 tests, TypeScript, lint, formatting and build). Browser verification confirmed baseline upload/reload, two-party activation, photographed return and the unchanged 48-hour deadline. Mobile comparison has no horizontal overflow at 390 px; authenticated backend gateway wiring remains a separate integration dependency.

## Private download checkpoint — 17 October 2026

Owner: Tayma AlDabbas. Implemented the authenticated private download endpoint at `/api/evidence/:id/download` and exported `signedEvidenceDownload` for the gateway. The route verifies the session/email, resolves paths through evidence RLS and signs through user-scoped Storage RLS for 60 seconds. Responses are private/no-store and do not disclose provider errors. Tests exercise endpoint authorization/error behavior and the browser transport; existing database tests cover underlying access policies. Hosted Supabase verification remains pending.

This completes the download endpoint, not the entire evidence gateway. Upload preparation/content verification/finalization, draft deletion and authoritative condition records remain open. No browser-local evidence is uploaded automatically.

Validation for this checkpoint: all 229 tests passed across 20 files, including the new download tests and existing embedded database access tests. TypeScript, lint, formatting, production build and diff whitespace checks passed. No hosted Storage or independent-browser integration was exercised.

## Demo verification checkpoint — Tayma AlDabbas, 17 October 2026

T1–T3 are complete for local Chromium; the image recovery defect found during verification also completes T4. This is local evidence, not final hosted-origin or independent-user verification.

- Added four original, clearly labelled synthetic PNG condition images under `public/demo-evidence/`: unchanged apartment wall mark/keys and camera baseline/return with a case scuff. Each is 960 × 640 and under 50 KB. The reproducible generator is `scripts/generate-demo-evidence.mjs`; it renders original vector illustrations locally without external assets.
- The [handover runbook](../../../docs/demo/handover-runbook.md) supplies exact notes, checklists, captions, files, reset/rebuild procedure and handoffs for Aiperi and Hayk. It explains that unpublished drafts may need re-uploading, submitted files cannot be replaced and clearing/replacing demo agreements does not synchronize browsers.
- Six browser checks in `tests/e2e/handover-evidence.spec.ts` pass: apartment and equipment at 1280 px and 390 px; new-baseline-version consent; corrupt submitted image recovery. They use real IndexedDB file blobs, normal UI uploads, owner/renter switching and reloads, not injected agreement snapshots.
- Checked owner-only baseline publication stays `FUNDED`; acknowledgement of the current version activates; no return form exists before activation; the first submitted return fixes exactly 48 hours; viewing/reloading/actor switching cannot move the deadline or release funds. Existing domain/UI tests additionally reject stale acknowledgements and mismatched comparison records.
- Uploaded images decode after reload in baseline, return and before/after views. Phone-width panels have no horizontal overflow; baseline checkboxes, acknowledgement, view switching, publication and return submission accept keyboard activation. This is a keyboard smoke check, not a full accessibility certification or physical-device camera test.
- Found and fixed a real preview gap: image decode failures previously left a broken image without recovery. Errors now identify the filename, expose retry, and explain draft re-upload versus resetting a fake demo when submitted local bytes are irrecoverable. Preview failures/retries do not mutate the condition record or consent. Two unit regressions cover decode failure and missing draft recovery.

Next.js development verification used `localhost:3000`, matching the running server origin; its development handshake was blocked at `127.0.0.1`. Browser tests wait for the saved-demo loading state to finish before interacting. No application origin/security settings were relaxed. Browser screenshots in ignored `test-results/` were visually reviewed, including the 390 px equipment comparison.

Full settlement browser journeys, deployment smoke checks and the final rehearsal remain Hayk's release tasks. Authenticated uploads, server baselines/returns and scheduled refunds remain deferred.

Validation: `npm run check` passed (231 unit/component/database tests, lint, TypeScript, formatting and production build), plus all six Chromium evidence browser checks. Document links and diff whitespace checks passed. The mobile comparison screenshots were reviewed; physical-device capture and final hosted-origin checks remain unverified.

## Upload UI checkpoint — 17 October 2026

replaced raw native file controls with prominent upload/camera buttons, supported-format/size guidance, optional caption help, an attached-file count, named upload progress and visible remove actions. File-count/disabled/submission guards are retained. Validation: `npm run check` passed with 236 tests; all six evidence browser checks passed using the keyboard-operated upload button and real file chooser. Two follow-up browser checks captured/reviewed the 390 px uploader and verified revised-baseline previews. No horizontal overflow was found. Physical-device camera capture remains unverified.

## Live-demo input update — 17 October 2026

apartment baseline drafts receive editable preset identifying details from the current agreement address plus sample condition/inventory/key notes and draft checklist selections. Presets apply only to browser-demo storage; photo uploads remain empty and mandatory, and publication/tenant acknowledgement remain explicit. Evidence is placed before the agreement/next-action/details grid on desktop and mobile. Existing submitted records are preserved. Regression coverage checks missing-photo rejection with presets, the live file chooser and the evidence-before-summary layout.

## Post-demo backend handoff

- Sameer/Valera coordination: implement authenticated gateway preparation/finalization/draft-removal operations and compose them with `signedEvidenceDownload`. UI `baseline` corresponds to the existing SQL/domain `collection` evidence phase; explicitly translate that phase and return server-allocated private paths. Arrival needs an agreed schema extension. Never trust browser paths or actor IDs.
- Sameer: provide authoritative baseline version/acknowledgment and return-declaration transactions with server timestamps. Browser models are not authority; the local deadline is displayed but does not run automatic refunds.
- Aiperi: import `EvidenceComparison` and pass the authorized case's matching baseline/return records, participant-name map and storage adapter. Arrival discrepancies supply evidence but do not automatically open/settle a case.
- Hayk: the demo now uses `ACTIVE` after both baseline acknowledgments. Include that state in separate dashboard integration. Evidence/inspection submissions leave financial balances unchanged.

## Updated agreement order

The local walkthrough now requires tenant terms acceptance before landlord baseline publication. The tenant reviews and acknowledges that baseline before funding; full simulated funding activates the rental. Baseline revisions before funding reset tenant acknowledgement. `FUNDED` remains readable for older funding-first browser saves, so those deposits are preserved and activation still requires baseline consent. The separate backend lifecycle remains an integration task.
