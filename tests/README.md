# Test workspaces

- `unit/`: meaningful domain, authorization-helper, and component tests. Vitest uses jsdom by default; use `// @vitest-environment node` for pure server/domain modules when appropriate.
- `e2e/`: Playwright transaction journeys, coordinated by Aiperi with each workstream owner.
- `setup.ts`: Testing Library matchers and cleanup.

`unit/` covers the local demo lifecycle and persistence, domain validation/allocation, the simulated provider, and database foundation. The PGlite suite executes migrations and checks SQL constraints, row-level policies, funding and cancellation operations without Docker. It does not prove hosted Supabase configuration, true concurrent transaction safety, server authorization/route behavior, deadline scheduling, or real transfers. Follow the money, permissions, evidence, and complete-exchange checklist in `plan.md`; add hosted integration and end-to-end tests as those parts are implemented.
