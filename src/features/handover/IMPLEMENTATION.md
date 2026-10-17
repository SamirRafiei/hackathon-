# Handover implementation checkpoints

Owner: Tayma AlDabbas. Coordination and shared contracts: main implementation agent.

Follow the current `plan.md`: one owner/renter, 48-hour security review from the first renter return declaration, QR deferred. No product/payment scope is changed by this workstream.

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

## Backend handoff

- Sameer/Valera coordination: implement authenticated gateway preparation/finalization/draft-removal operations and compose them with `signedEvidenceDownload`. UI `baseline` corresponds to the existing SQL/domain `collection` evidence phase; explicitly translate that phase and return server-allocated private paths. Arrival needs an agreed schema extension. Never trust browser paths or actor IDs.
- Sameer: provide authoritative baseline version/acknowledgment and return-declaration transactions with server timestamps. Browser models are not authority; the local deadline is displayed but does not run automatic refunds.
- Aiperi: import `EvidenceComparison` and pass the authorized case's matching baseline/return records, participant-name map and storage adapter. Arrival discrepancies supply evidence but do not automatically open/settle a case.
- Hayk: the demo now uses `ACTIVE` after both baseline acknowledgments. Include that state in separate dashboard integration. Evidence/inspection submissions leave financial balances unchanged.
