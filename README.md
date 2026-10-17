# Pact

Make a pact. Keep it fair.

Pact is a prototype for making rental deposits easier to understand and settle fairly. The demo starts with an apartment deposit and lets the landlord create an apartment or equipment security-deposit agreement. The tenant accepts the exact agreement version, then the landlord publishes a photographed condition baseline. The tenant reviews and acknowledges that baseline before simulated funding becomes available. Funding the full deposit activates the rental; a photographed return starts the 48-hour review before refund or an agreed split. The broader product plan is in [plan.md](./plan.md).

The idea can fit inside a banking app or another trusted host experience. This standalone prototype has no banking-provider integration and does not hold, move, or protect real money.

The repository includes a Supabase-backed account flow for email/password sign-in, agreement creation, invitation claiming, and exact-version acceptance. The account setup preview entry has been removed from the demo; account integration and verification are deferred until after the hackathon. The landing-page walkthrough remains browser-local. Database migrations also define the broader ledger and simulated funding/cancellation foundation; funding and the remaining rental lifecycle are not connected to the account flow yet.

## Start locally

Use Node.js 22.12+ on the 22.x line, or a supported even-numbered LTS release (24+), with npm. Use the committed `package-lock.json`; do not introduce another package manager's lockfile.

```sh
npm ci
```

```sh
npm run dev
```

Open http://localhost:3000. The demo works without Docker, Supabase credentials, or an account. A fresh visit or **Reset demo** opens landlord agreement creation with editable apartment terms and a demo contract PDF already attached. Create the agreement, then switch to the tenant to review the terms and PDF. Saved agreements resume after refresh. You can also choose the camera preset or replace the sample with your own PDF (up to 10 MB). Uploaded contract bytes live in IndexedDB and stay bound to the accepted agreement version. Demo choices, condition records, and activity are saved in that browser's local storage. Actual photo files are stored in IndexedDB and survive reloads. Two different browsers do not share data; clearing browser storage removes the demo and its evidence.

This identity switch is a demo control, not sign-in or proof of identity. Anyone can switch between the fake parties. The landing-page walkthrough stores its agreement and activity in that browser's local storage and is not an authoritative record. The separate account flow uses Supabase Auth and server-side database operations for persistent agreement setup, invited-email claiming, and acceptance. Do not use real money: simulated funding is not connected to a payment provider. A future banking-host integration must verify a signed identity assertion on the server; a browser-provided name, role, or biometric claim is not sufficient.

## Project structure

```text
src/
  app/                 App Router entry and global styles
  components/ui/       Shared accessible UI components
  features/
    demo/               Seeded agreement, local demo repository, interactive workflow
    agreements/        Local demo setup form; authenticated persistence is pending
    deposits/          Reserved for future provider, persistent funding, transaction history
    handover/          Evidence adapters, baseline consent, return, comparison, arrival inspection
    disputes/          Claims, negotiation, reviewer workspace
  lib/
    auth/              Identity-provider boundary; current fake demo identities
    domain/            Shared validation, agreement contracts, allocation and provider boundary
    supabase/          Browser and server client factories
    env.ts             Lazy public Supabase environment validation
    utils.ts           Tailwind-aware class name helper
  types/database.ts    Typed subset of the agreement RPC/database schema
supabase/              Local configuration, ordered schema/access/operation migrations and docs
scripts/               Database type-generation utility
tests/unit/            Demo, domain, simulated provider and embedded PostgreSQL tests
tests/e2e/             Playwright handover/evidence browser checks
public/                Static assets
```

The demo domain transitions are kept separate from the UI and persisted through a `PactRepository` interface. `LocalDemoRepository` is only for the browser demo; a future Supabase repository should enforce every mutation and read access on the server/database.

**Identity boundary:** `IdentityProvider` is an integration seam, not authentication by itself. The demo provider returns fake actors. A real provider must validate the host's signed, short-lived assertion server-side and resolve the resulting identity to agreement membership. Never accept a client-selected role for real agreements.

## Handover and inspection modules

The agreement now includes an **Evidence for a fair exchange** section:

1. Fund the accepted agreement, then switch to the owner and publish the initial condition with a photo and asset checklist.
2. Switch to the renter and acknowledge that exact baseline. The rental activates only after both parties acknowledge it.
3. Use **Return declaration** to record photos, location, and any checklist exceptions. The first declaration fixes one 48-hour review deadline without releasing funds.
4. Use **Before & after** to compare the matching baseline and return; differences alone do not decide responsibility.
5. Apartment agreements also expose a reusable **Arrival inspection** form. It records access, availability, and listing conformity. On the existing security-deposit demo it does not authorize an advance payment or change payment purpose.

Initial condition records accept JPEG/PNG/WebP photos only. Contract PDFs are attached during agreement setup; dispute evidence also supports PDFs. Evidence files are limited to 10 MB each and 12 files per record. Pending uploads block submission. Finalized records/files cannot be edited/deleted through the ordinary adapter; failed previews and uploads have retry controls. All local timestamps are demo device times, not server-verified proof.

`SupabaseEvidenceStorage` is an adapter around an injected **authenticated server gateway**, not a completed backend upload service. Server preparation/finalization, authoritative baseline/return persistence, private signed downloads, and scheduled deadline refunds remain backend integration work. No uploaded file is silently sent to a hosted service. See [handover integration notes](./src/features/handover/IMPLEMENTATION.md) and [storage requirements](./src/features/handover/evidence/README.md).

## Installed toolkit

| Area       | Packages                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js App Router, React, TypeScript                                                                    |
| Styling/UI | Tailwind CSS v4, Radix UI primitives, Lucide icons, `clsx`, `tailwind-merge`, `class-variance-authority` |
| Supabase   | `@supabase/supabase-js`, `@supabase/ssr`, project-local Supabase CLI                                     |
| Forms      | React Hook Form, Zod, `@hookform/resolvers`                                                              |
| QR         | `qrcode` (generation), `html5-qrcode` (camera/file scanning)                                             |
| Dates      | `date-fns`                                                                                               |
| Quality    | Biome linting, Prettier with Tailwind ordering, Vitest, PGlite, Testing Library, jsdom, Playwright       |

The interactive demo uses the Next.js App Router, React client state, Zod to validate saved demo data, and browser local storage. Load scanner/QR and other browser-heavy packages only in features that need them. No external font request is needed. Development and production builds explicitly use Webpack for this Windows setup.

## Commands

| Command                                        | Purpose                                               |
| ---------------------------------------------- | ----------------------------------------------------- |
| `npm run dev`                                  | Local development                                     |
| `npm run build` / `npm start`                  | Build / serve production app                          |
| `npm run lint` / `npm run lint:fix`            | Biome lint checks / fixes                             |
| `npm run typecheck`                            | Generate route types and check TypeScript             |
| `npm run format` / `npm run format:check`      | Format / verify formatting (`plan.md` excluded)       |
| `npm test` / `npm run test:watch`              | Vitest run / watch                                    |
| `npm run test:db`                              | Embedded PostgreSQL migration and policy tests        |
| `npm run test:e2e` / `npm run test:e2e:ui`     | Playwright journeys / interactive runner              |
| `npm run check`                                | Lint, types, formatting, unit tests, production build |
| `npm run db:start` / `npm run db:stop`         | Start / stop local Supabase (requires Docker)         |
| `npm run db:status`                            | Show local Supabase connection details                |
| `npm run db:migration:new -- name`             | Create a new database migration                       |
| `npm run db:types`                             | Generate types from running local Supabase            |
| `npm run db:types -- --project-id PROJECT_REF` | Generate types from an authorized hosted project      |

Vitest covers simulated agreement setup, acceptance/lifecycle, form validation, domain rules and local-storage persistence. `npm run test:db` applies the migrations in embedded PGlite and checks database constraints/policies. PGlite is useful for SQL regression checks but does not establish hosted Supabase behavior, true concurrent transaction safety, server authorization, or real money movement. Playwright now includes six local handover/evidence checks for photo reload, consent, comparison, phone-width layout and recovery. Run `npx playwright test tests/e2e/handover-evidence.spec.ts --workers=1`; the checks use `localhost:3000` to match the development origin. Complete settlement journeys and final deployed-origin verification remain release work. Fake sample images and reset/checklist instructions are in [the handover runbook](./docs/demo/handover-runbook.md). Before running the first browser test, install Chromium with `npx playwright install chromium` (on Linux CI use `--with-deps`). GitHub Actions currently runs `npm run check`, not browser tests.

## Supabase workflow

`supabase/config.toml` is local development configuration, not a hosted deployment. Docker is optional for frontend work and required only for running the local Supabase stack.

```sh
# Local database development (Docker running)
npm run db:start
npm run db:status
npm run db:types
```

For an existing hosted project, authenticate with `npx supabase login` and generate types using the project reference command above. The project ID flag is explicit; the script does not load `.env.local`. Review and apply migrations only to a project you are authorized to change.

The migrations define agreement/version, acceptance, evidence, dispute, ledger and audit tables, integrity constraints, participant access, private evidence storage, simulated funding, and pre-handover cancellation/refund operations. The authenticated account flow uses migration `20261017000600_agreement_setup.sql` for agreement creation, invitation claiming, and acceptance. The root walkthrough remains a local fixture and is not shared between browsers. The account flow uses Supabase Auth and server-side authorization; host-app identity assertions, funding-provider integration, handover/return/dispute UI and operations, scheduled deadline processing, and reviewer setup remain future work. `src/types/database.ts` currently contains the typed subset used by the account-flow RPCs; regenerate full database types when schema work stabilizes. Use Docker only if you choose to run the local Supabase stack; the app and embedded database tests do not need Docker.

## Next implementation steps

1. Keep the browser-local walkthrough restricted to fake data.
2. Complete the remaining handover, return, dispute, and settlement workflow through authorized server operations.
3. Integrate a real funding provider only after its security, reconciliation, and compliance requirements are defined.
4. Add hosted/concurrent access and deadline-worker checks before using real funds.
5. Do not commit local credentials or screenshots containing secrets.

Vercel can use its standard Next.js preset and the repository root. Add the public environment values when backend features are enabled. Deployment, Supabase provisioning, and GitHub branch creation are not performed by this scaffold.

## References

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase Next.js SSR setup](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Supabase local development](https://supabase.com/docs/guides/local-development)

For the local demo, initial-condition and return declarations have editable presets for apartment and camera rentals. After funding, the tenant automatically lands on **Return declaration**, including after reload. Opening the draft does not submit it or start the 48-hour review; review the checklist and attach photos before submitting.
