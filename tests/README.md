# Test workspaces

- `unit/`: meaningful domain, authorization-helper, and component tests. Vitest uses jsdom by default; use `// @vitest-environment node` for pure server/domain modules when appropriate.
- `e2e/`: Playwright transaction journeys, coordinated by Aiperi with each workstream owner.
- `setup.ts`: Testing Library matchers and cleanup.

There are no test cases yet. Follow the money, permissions, evidence, and complete-exchange checklist in `plan.md`. Add database integration tests alongside Sameer's migrations once the schema is defined.
