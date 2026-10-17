# Test workspaces

- `unit/`: meaningful domain, authorization-helper, and component tests. Vitest uses jsdom by default; use `// @vitest-environment node` for pure server/domain modules when appropriate.
- `e2e/`: Playwright browser checks; Hayk coordinates release/settlement journeys with workstream owners. Tayma owns `handover-evidence.spec.ts` for evidence persistence, consent, comparison and recovery.
- `setup.ts`: Testing Library matchers and cleanup.

`unit/` covers the local demo lifecycle and persistence, domain validation/allocation, the simulated provider, and database foundation. The PGlite suite executes migrations and checks SQL constraints, row-level policies, funding and cancellation operations without Docker. It does not prove hosted Supabase configuration, true concurrent transaction safety, server authorization/route behavior, deadline scheduling, or real transfers. Follow the money, permissions, evidence, and complete-exchange checklist in `plan.md`; add hosted integration and end-to-end tests as those parts are implemented.

For the six evidence browser checks, install Chromium with `npx playwright install chromium`, then run `npx playwright test tests/e2e/handover-evidence.spec.ts --workers=1`. The file uses `localhost:3000` to match the local development origin and waits for hydration before interacting. Original synthetic PNGs live in `public/demo-evidence/`; `scripts/generate-demo-evidence.mjs` regenerates them. The checks do not claim authenticated shared storage or complete financial settlement. See [the runbook](../docs/demo/handover-runbook.md) for manual rehearsal and fixture inputs.

Aiperi's focused negotiation rehearsal is `e2e/equipment-negotiation.spec.ts` (desktop and phone widths). Run `npx playwright install chromium` once, then `npm run test:e2e -- equipment-negotiation`. It starts from a valid equipment return-review fixture and verifies €25 → request revision → €20, reserved funds before consent, reload, final €280/€20 ledger postings and activity. It does not upload photos or certify their persistence: Hayk's H2 full journeys remain separate. `unit/demo-negotiation.test.tsx` exercises the same workspace controls and local repository, plus completion rendering against the ledger when a rejected proposal remains.

## Valera setup verification

`agreement-setup-form.test.tsx`, `demo-setup-values.test.ts` and `demo-setup-navigation.test.tsx` cover shared apartment/camera defaults, input boundaries and exact-cent parsing, role guards, visible correction/retry, and creation/acceptance with no account setup preview entry. The shared fixtures use `src/features/demo/agreement-presets.ts`.

`tests/e2e/valera-setup.spec.ts` exercises both examples, invalid dates/fractional cents, role permissions, acceptance and reload at 1280px and 390px. The equipment negotiation journey now explicitly opens Start dispute before each proposal. Run these with the configured Playwright browser on a supported machine. The implementation environment's Chrome aborted at launch, so these new browser runs are not recorded as passing. The 270 unit/component tests and production build passed on the prepared integrated snapshot.
