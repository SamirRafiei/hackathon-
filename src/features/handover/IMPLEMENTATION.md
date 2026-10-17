# Handover implementation checkpoints

Owner: Tayma AlDabbas. Coordination and shared contracts: main implementation agent.

Follow the current `plan.md`: one owner/renter, 48-hour security review from the first renter return declaration, QR deferred. No product/payment scope is changed by this workstream.

| Module        | Scope                                                                  | Status      |
| ------------- | ---------------------------------------------------------------------- | ----------- |
| `evidence/`   | Validated uploader, preview/download, storage adapter boundary         | In progress |
| `baseline/`   | Asset checklist, immutable baseline versions, two-party acknowledgment | In progress |
| `returns/`    | Return declaration tied to baseline, one review deadline               | In progress |
| `comparison/` | Baseline/return evidence and checklist comparison                      | Queued      |
| `arrival/`    | Accepted-listing comparison and renter inspection                      | Queued      |

Only the coordinator changes `contracts.ts`, application integration, shared styles, package files, or existing domain/schema files. Each module owns its tests. No agent independently commits, pushes, installs dependencies, or edits another module.

The existing interactive app is a browser-local simulation with fake actors. Demo attachments must be explicitly labeled local and must not pretend to be private multi-user Supabase storage. Production evidence adapters require authenticated server preparation/finalization and authorized private downloads; existing metadata/RLS alone are not a complete upload workflow.
