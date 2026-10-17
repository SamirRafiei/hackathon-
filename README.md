# Pact

Make a pact. Keep it fair.

Pact is a prototype for making rental deposits easier to understand and settle fairly. The demo starts with an apartment deposit and lets the landlord create an apartment or equipment security-deposit agreement. The tenant reviews and accepts the exact version before simulated funding, return review, and an agreed split. The broader product plan is in [plan.md](./plan.md).

The idea can fit inside a banking app or another trusted host experience. This standalone prototype has no banking-provider integration and does not hold, move, or protect real money.

The repository includes a Supabase-backed account flow for email/password sign-in, agreement creation, invitation claiming, and exact-version acceptance. The separate landing-page walkthrough remains browser-local. Database migrations also define the broader ledger and simulated funding/cancellation foundation; funding and the remaining rental lifecycle are not connected to the account flow yet.

## Start locally

Use Node.js 22.12+ on the 22.x line, or a supported even-numbered LTS release (24+), with npm. Use the committed `package-lock.json`; do not introduce another package manager's lockfile.

```sh
npm ci
```

```sh
npm run dev
```

Open http://localhost:3000. The demo works without Docker, Supabase credentials, or an account. Use the landlord/tenant switcher to walk through the seeded agreement or create a local apartment/equipment agreement. Demo choices and activity are saved in that browser's local storage, so two different browsers do not share data.

This identity switch is a demo control, not sign-in or proof of identity. Anyone can switch between the fake parties. The landing-page walkthrough stores its agreement and activity in that browser's local storage and is not an authoritative record. The separate account flow uses Supabase Auth and server-side database operations for persistent agreement setup, invited-email claiming, and acceptance. Do not use real money: simulated funding is not connected to a payment provider. A future banking-host integration must verify a signed identity assertion on the server; a browser-provided name, role, or biometric claim is not sufficient.

## Project structure

```text
src/
  app/                 App Router entry and global styles
  components/ui/       Shared accessible UI components
  features/
    demo/               Seeded agreement, local demo repository, interactive workflow
    agreements/        Demo setup plus authenticated persistent setup, invitation, acceptance
    deposits/          Deposit-provider contracts and simulated funding operations
    handover/          Planned condition evidence, collection and return workflows
    disputes/          Planned claims, negotiation and reviewer workspace
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
tests/e2e/             Playwright configuration for future browser journeys
public/                Static assets
```

The demo domain transitions are kept separate from the UI and persisted through a `PactRepository` interface. `LocalDemoRepository` is only for the browser demo; a future Supabase repository should enforce every mutation and read access on the server/database.

**Identity boundary:** `IdentityProvider` is an integration seam, not authentication by itself. The demo provider returns fake actors. A real provider must validate the host's signed, short-lived assertion server-side and resolve the resulting identity to agreement membership. Never accept a client-selected role for real agreements.

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

Vitest covers simulated agreement setup, acceptance/lifecycle, form validation, domain rules and local-storage persistence. `npm run test:db` applies the migrations in embedded PGlite and checks database constraints/policies. PGlite is useful for SQL regression checks but does not establish hosted Supabase behavior, true concurrent transaction safety, server authorization, or real money movement. Playwright is configured, but there are no browser journeys yet. Before running the first browser test, install Chromium with `npx playwright install chromium` (on Linux CI use `--with-deps`). GitHub Actions currently runs `npm run check`, not browser tests.

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
