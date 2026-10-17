# Private condition evidence

`EvidenceUploader` and `EvidencePreview` consume the shared `EvidenceStorage` interface.

## Explicit browser demonstration

`BrowserDemoEvidenceStorage` stores actual file blobs and metadata in IndexedDB on this browser. It does not transfer files to Supabase, authenticate actors, synchronize devices, or provide tamper resistance against this browser's user. Finalized files cannot be removed through the adapter. Clearing browser data removes demo evidence. The caller must also persist the containing condition record; file persistence alone does not publish a baseline or return.

## Authenticated Supabase integration

`SupabaseEvidenceStorage` requires an injected `AuthorizedEvidenceGateway`; it never creates a privileged browser client. The gateway must authenticate every call, derive the actual actor from the session, check agreement membership and allowed phase, enforce file count/size/type limits, allocate private paths, upload into a private bucket, inspect uploaded bytes and hashes before finalization, and enforce append-only submitted records in the database. Signed downloads must be short-lived and participant/reviewer authorized. Reviewer access must follow case authorization. Draft deletion must check ownership and persisted submission state atomically.

Client signature checks are input validation, not server security. Production gateway implementation is intentionally not provided here; missing wiring must fail visibly rather than report simulated success.
