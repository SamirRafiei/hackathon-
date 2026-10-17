# Agreements — Valera Murzin

Home for agreement forms, revisions, invitation claiming, and current-version acceptance. `components/agreement-setup-form.tsx` and `src/features/demo/model.ts` currently power the browser-local walkthrough; that remains a clearly labeled demo and is not persistent evidence of assent.

The authenticated backend foundation is in migration `supabase/migrations/20261017000700_agreement_setup.sql`: it bootstraps a profile from a verified Supabase session, creates an immutable version-one agreement and hashed invitation, claims the invite only for its verified email, and records exact-version acceptance. Server actions in `server/mutations.ts` validate inputs, derive the session from Supabase Auth, and call those RPCs. All operations are database-transactional and idempotent. The persisted path is available at `/login`, `/signup`, `/agreements/new`, `/invite/[token]`, and `/agreements/[id]`.

The `/` walkthrough remains browser-local and clearly labeled as a demo; the account workspace is a separate persistent agreement setup/claim/acceptance slice. Configure the app URL and Supabase Auth redirect allowlist to include `/auth/callback`. Funding remains simulated; the backend demo provider does not hold or move money.
