# Handover implementation checkpoints

Owner: Tayma AlDabbas. Coordination and shared contracts: main implementation agent.

Follow the current `plan.md`: one owner/renter, 48-hour security review from the first renter return declaration, QR deferred. No product/payment scope is changed by this workstream.

| Module        | Scope                                                                  | Status                          |
| ------------- | ---------------------------------------------------------------------- | ------------------------------- |
| `evidence/`   | Validated uploader, preview/download, storage adapter boundary         | Implemented; focused tests pass |
| `baseline/`   | Asset checklist, immutable baseline versions, two-party acknowledgment | Implemented; focused tests pass |
| `returns/`    | Return declaration tied to baseline, one review deadline               | Implemented; focused tests pass |
| `comparison/` | Baseline/return evidence and checklist comparison                      | Queued                          |
| `arrival/`    | Accepted-listing comparison and renter inspection                      | Queued                          |

Only the coordinator changes `contracts.ts`, application integration, shared styles, package files, or existing domain/schema files. Each module owns its tests. No agent independently commits, pushes, installs dependencies, or edits another module.

The existing interactive app is a browser-local simulation with fake actors. Demo attachments must be explicitly labeled local and must not pretend to be private multi-user Supabase storage. Production evidence adapters require authenticated server preparation/finalization and authorized private downloads; existing metadata/RLS alone are not a complete upload workflow.

Integration checkpoint: all five modules are implemented and their focused tests pass. The existing browser demo is wired through `handover-workspace.tsx`, persists record metadata in the agreement snapshot and actual files in IndexedDB. The integrated project checks pass (205 tests, TypeScript, lint, formatting and build). Browser verification confirmed baseline upload/reload, two-party activation, photographed return and the unchanged 48-hour deadline. Mobile comparison has no horizontal overflow at 390 px; authenticated backend gateway wiring remains a separate integration dependency.

## Backend handoff

- Sameer/Valera: implement authenticated gateway preparation/finalization/download/draft-removal operations. UI `baseline` corresponds to the existing SQL/domain `collection` evidence phase; the gateway must explicitly translate that phase and return server-allocated private paths, not trust browser paths or actor IDs.
- Sameer: provide authoritative baseline version/acknowledgment and return-declaration transactions with server timestamps. Browser models are not authority; the local deadline is displayed but does not run automatic refunds.
- Aiperi: import `EvidenceComparison` and pass the authorized case's baseline/return records and storage adapter; no direct reads of unrelated evidence. Arrival discrepancies supply evidence but do not open/settle a case by themselves.
- Hayk: the existing demo now uses `ACTIVE` after both baseline acknowledgments. Include that state in any separate dashboard integration. Financial balances are unchanged by evidence/inspection submissions.

## Backend handoff

- Sameer/Valera: implement authenticated gateway preparation/finalization/download/draft-removal operations. UI `baseline` corresponds to the existing SQL/domain `collection` evidence phase; explicitly translate that phase and return server-allocated private paths. Never trust browser paths or actor IDs.
- Sameer: provide authoritative baseline version/acknowledgment and return-declaration transactions with server timestamps. Browser models are not authority; the local deadline is displayed but does not run automatic refunds.
- Aiperi: import `EvidenceComparison` and pass the authorized case's matching baseline/return records, participant-name map and storage adapter. Arrival discrepancies supply evidence but do not automatically open/settle a case.
- Hayk: the demo now uses `ACTIVE` after both baseline acknowledgments. Include that state in separate dashboard integration. Evidence/inspection submissions leave financial balances unchanged.
