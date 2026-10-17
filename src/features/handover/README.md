# Handover and return — Tayma AlDabbas

Condition evidence modules for apartment/equipment security deposits and student arrival inspections. Follow the current `plan.md`: QR verification is deferred and return submission starts one 48-hour review window.

- `evidence/`: reusable uploader/previews, IndexedDB demo files, injected authenticated Supabase gateway adapter.
- `baseline/`: asset-specific versioned checklists, owner publication, explicit two-party acknowledgment.
- `returns/`: renter's photographed declaration and fixed 48-hour review deadline.
- `comparison/`: read-only before/after evidence and checklist differences.
- `arrival/`: renter's access/availability/listing-conformity inspection, without financial release.

The existing demo uses local identities. Local evidence is not authenticated, shared between browsers, or tamper-resistant against the browser user. Production gateway wiring, database baseline/return operations and server deadline processing still need coordination with Sameer and Valera; reviewer screens consume the comparison component through Aiperi's workstream. See `evidence/README.md` for the private-storage requirements.
