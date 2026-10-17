# Test workspaces

- `unit/`: meaningful domain, authorization-helper, and component tests. Vitest uses jsdom by default; use `// @vitest-environment node` for pure server/domain modules when appropriate.
- `e2e/`: Playwright transaction journeys, coordinated by Aiperi with each workstream owner.
- `setup.ts`: Testing Library matchers and cleanup.

Stage 1 tests:

- `unit/allocation.test.ts`: exact allocation, deterministic ties, invalid inputs and 2,000 reproducible conservation/quota cases.
- `unit/domain-validation.test.ts`: policy, terms, revision and evidence metadata validation.
- `unit/database-foundation.test.ts`: apply every migration to embedded PostgreSQL (PGlite); test SQL/TypeScript parity, RLS/grants, private object policies, immutable history, aggregate constraints and balanced postings.

Run `npm test` for all three suites, or `npm run test:db` for database tests. The database harness minimally stubs Supabase-owned Auth/Storage objects, not PACT tables, policies or functions. No external database, credentials or Docker is required. It does not emulate Auth/JWT verification, Storage HTTP, PostgREST or Cron, and its single connection cannot verify concurrency races. Those checks and browser journeys remain Stage 2 work against the actual Supabase stack. Follow the complete verification checklist in `plan.md`.
