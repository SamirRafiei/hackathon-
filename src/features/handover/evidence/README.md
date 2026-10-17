# Private condition evidence

`EvidenceUploader` and `EvidencePreview` consume the shared `EvidenceStorage` interface.

The uploader exposes explicit **Upload photos** (or **Upload files** for disputes) and **Take photo** buttons with keyboard focus styles and phone-friendly targets. Native pickers are hidden behind those buttons. Optional captions apply to the next files added; previews, the attached-file count, per-file progress and remove/retry actions show what happened. Choosing a file adds a draft; the containing record's publish/submit action finalizes it. Camera capture depends on device support and falls back to the device picker on desktop.

## Explicit browser demonstration

`BrowserDemoEvidenceStorage` stores actual file blobs and metadata in IndexedDB on this browser. It does not transfer files to Supabase, authenticate actors, synchronize devices, or provide tamper resistance against this browser's user. Finalized files cannot be removed through the adapter. Clearing browser data removes demo evidence. The caller must also persist the containing condition record; file persistence alone does not publish a baseline or return.

## Authenticated Supabase integration

`SupabaseEvidenceStorage` requires an injected `AuthorizedEvidenceGateway`; it never creates a privileged browser client. The gateway must authenticate every call, derive the actual actor from the session, check agreement membership and allowed phase, enforce file count/size/type limits, allocate private paths, upload into a private bucket, inspect uploaded bytes and hashes before finalization, and enforce append-only submitted records in the database. Signed downloads must be short-lived and participant/reviewer authorized. Reviewer access must follow case authorization. Draft deletion must check ownership and persisted submission state atomically.

Client signature checks are input validation, not server security. Upload preparation, byte verification, finalization and draft deletion still need server operations; missing wiring must fail visibly rather than report simulated success.

## Authenticated private downloads — Tayma AlDabbas

`GET /api/evidence/:id/download` implements the download portion of the gateway. It requires a verified Supabase session and uses the cookie-bound publishable-key client for both the evidence query and Storage signing. Existing RLS limits drafts to the uploader and submitted files to members or assigned independent reviewers. Missing and inaccessible records both return 404. No actor ID, object path, bucket or expiry is accepted from the caller.

The response is `{ url, expiresIn: 60 }` with private/no-store headers. The signed URL is a bearer capability valid for up to 60 seconds, including after access revocation; do not persist or log it. `signedEvidenceDownload` is exported for the authenticated gateway's `signedDownload` method and requests a fresh link without caching. The browser-local demonstration continues using IndexedDB URLs.

This endpoint requires the existing access/storage migrations and persisted evidence metadata/objects. No hosted project was provisioned or modified. Route tests cover session checks, hidden records, stored-path signing, Storage refusal, sanitized errors and caching; existing embedded database tests cover membership, reviewer revocation and draft visibility. Hosted Storage behavior still needs verification.
