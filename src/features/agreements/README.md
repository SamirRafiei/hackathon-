# Agreements — Valera Murzin

Home for agreement forms, revisions, invitation claiming, and current-version acceptance. `components/agreement-setup-form.tsx` provides local demo setup for apartment and equipment security deposits. `src/features/demo/model.ts` validates and creates a version-one demo snapshot; the tenant must confirm the displayed version before accepting it.

The setup and acceptance flow is browser-local and must remain clearly labeled as a demo. It is not a persistent agreement or proof of assent. Use `src/lib/auth/` for any future verified identity and membership checks. Coordinate immutable version snapshots and participant/share contracts with the database workstream; follow `plan.md` before implementing authenticated routes or RPC adapters.
