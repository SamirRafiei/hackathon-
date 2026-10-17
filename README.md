# Pact

Make a pact. Keep it fair.

Pact hackathon application foundation with Stage 1 database schema, integrity checks, RLS, private evidence policies, shared domain contracts and tested contribution allocation. Product screens, authentication flows, financial mutation RPCs, and handover/dispute workflows are **not implemented yet**. See [plan.md](./plan.md) for the agreed rules, [schema v1](./supabase/SCHEMA.md) for database details and [operation contracts](./supabase/OPERATIONS.md) for the team handoff.

Pact is pitched as a proposed agreement/deposit layer within the Wise ecosystem. The prototype is a standalone Next.js/Supabase app with simulated financial operations; it has no Wise integration.

## Start locally

Use Node.js 22.12+ on the 22.x line, or a supported even-numbered LTS release (24+), with npm. Use the committed `package-lock.json`; do not introduce another package manager's lockfile.

```sh
npm ci
```

Copy `.env.example` to `.env.local`:

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

```sh
# macOS / Linux
cp .env.example .env.local
```

```sh
npm run dev
```

Open http://localhost:3000. The static starter page works without Supabase credentials. There is no database connection or session refresh on that page.

For backend work, fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using the team's project or a local Supabase instance, then restart the dev server. These are public connection values; privileged secret/service-role keys must never use the `NEXT_PUBLIC_` prefix. Never commit `.env.local`.

## Team workspaces

| Person | Team member    | Main folders                                                                            |
| ------ | -------------- | --------------------------------------------------------------------------------------- |
| 1      | Sameer         | `supabase/`, `src/lib/domain/`, `src/types/database.ts`                                 |
| 2      | Valera Murzin  | `src/features/agreements/`, `src/lib/auth/`, auth/invitation routes                     |
| 3      | Hayk           | `src/features/deposits/`, `src/components/ui/`, dashboard/activity routes, shared shell |
| 4      | Tayma AlDabbas | `src/features/handover/`, handover/return routes                                        |
| 5      | Aiperi         | `src/features/disputes/`, dispute/reviewer routes, E2E scenarios                        |

Sameer coordinates schema changes and shared operation contracts. Hayk coordinates shared UI and global styles. Route directories are intentionally empty until their owners implement them; they are not working screens. Do not create placeholder business logic or invented database types to work around a missing contract.

```text
src/
  app/                 App Router entry, global styles, reserved route folders
  components/ui/       Shared accessible UI components
  features/
    agreements/        Creation, revisions, invitations, acceptance
    deposits/          Contributions, simulated provider, history
    handover/          Condition evidence, QR/code, collection, return
    disputes/          Claims, negotiation, reviewer workspace
  lib/
    auth/              Future server identity and membership checks
    domain/            Shared validation, allocation, DTOs and operation contracts
    supabase/          Browser and server client factories
    env.ts             Lazy public Supabase environment validation
    utils.ts           Tailwind-aware class name helper
  types/database.ts    Explicit empty-schema placeholder; generate after migrations
supabase/              Local configuration, schema/RLS migrations and documentation
scripts/               Database type-generation utility
tests/unit/            Future focused domain/component tests
tests/e2e/             Future Playwright transaction journeys
public/                Static assets
```

Use `@/` for imports from `src/`. Keep components as Server Components unless they need browser state/events. Import browser/server Supabase clients explicitly from their respective modules. Server Actions and Route Handlers must each authorize their own operations.

**Auth setup still required:** Valera must implement Supabase's documented Next.js Proxy/session refresh and verified server identity checks before enabling authenticated routes. The included factories are connection plumbing, not a completed authentication system. No route guards or service-role client are provided.

## Installed toolkit

| Area       | Packages                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js App Router, React, TypeScript                                                                    |
| Styling/UI | Tailwind CSS v4, Radix UI primitives, Lucide icons, `clsx`, `tailwind-merge`, `class-variance-authority` |
| Supabase   | `@supabase/supabase-js`, `@supabase/ssr`, project-local Supabase CLI                                     |
| Forms      | React Hook Form, Zod, `@hookform/resolvers`                                                              |
| QR         | `qrcode` (generation), `html5-qrcode` (camera/file scanning)                                             |
| Dates      | `date-fns`                                                                                               |
| Quality    | Biome linting, Prettier with Tailwind ordering, Vitest, Testing Library, jsdom, Playwright               |

Only Next.js, the stylesheet, and startup page run initially. Load scanner/QR and other browser-heavy packages in the feature that needs them; they are not imported into the initial page. No external font request is needed to build. Development and production builds explicitly use Webpack to avoid a Turbopack CSS worker failure observed on this Windows setup.

## Commands

| Command                                        | Purpose                                               |
| ---------------------------------------------- | ----------------------------------------------------- |
| `npm run dev`                                  | Local development                                     |
| `npm run build` / `npm start`                  | Build / serve production app                          |
| `npm run lint` / `npm run lint:fix`            | Biome lint checks / fixes                             |
| `npm run typecheck`                            | Generate route types and check TypeScript             |
| `npm run format` / `npm run format:check`      | Format / verify formatting (`plan.md` excluded)       |
| `npm test` / `npm run test:watch`              | Domain and embedded PostgreSQL tests / watch          |
| `npm run test:db`                              | Migration, integrity and RLS tests without Docker     |
| `npm run test:e2e` / `npm run test:e2e:ui`     | Playwright journeys / interactive runner              |
| `npm run check`                                | Lint, types, formatting, unit tests, production build |
| `npm run db:start` / `npm run db:stop`         | Start / stop local Supabase (requires Docker)         |
| `npm run db:status`                            | Show local Supabase connection details                |
| `npm run db:migration:new -- name`             | Create an empty migration for Sameer's schema work    |
| `npm run db:types`                             | Generate types from running local Supabase            |
| `npm run db:types -- --project-id PROJECT_REF` | Generate types from an authorized hosted project      |

Vitest runs contribution allocation, shared validation, and actual migrations/RLS in embedded PostgreSQL (PGlite). Empty suites no longer pass. Supabase-owned Auth/Storage infrastructure is minimally stubbed for database tests; full Supabase integration and concurrency tests remain required. Playwright reports no tests until the team adds journeys. Before the first browser test, install Chromium with `npx playwright install chromium` (on Linux CI use `--with-deps`). GitHub Actions runs `npm run check`, including the database tests, but not browser journeys.

## Supabase workflow

`supabase/config.toml` is local development configuration, not a hosted deployment. Docker is optional for frontend work and required only for running the local Supabase stack.

```sh
# Local database development (Docker running)
npm run db:start
npm run db:status
npm run db:migration:new -- initial_schema
# Sameer implements and applies the schema before generating types.
npm run db:types
```

For an existing hosted project, authenticate with `npx supabase login` and generate types using the project reference command above. The project ID flag is explicit; the script does not load `.env.local`. Coordinate linking, schema application, and remote writes with Sameer. Do not independently push competing migrations to the shared database.

Ordered Stage 1 migrations create the application tables, integrity checks, RLS and private evidence bucket. No hosted schema has been applied, reviewer/users provisioned, cron scheduled, or financial RPCs enabled. `src/types/database.ts` remains an explicit empty-schema placeholder because official local generation is blocked by the missing Docker engine. The generator writes only after a successful CLI response; do not invent database types. See [schema setup](./supabase/SCHEMA.md) for application and verification steps.

## Before feature work

1. Each teammate creates their assigned feature branch from the same scaffold commit (see `plan.md`).
2. Sameer publishes the shared schema, permissions, money representation, lifecycle, and operation contracts.
3. Valera completes auth/session refresh; Hayk supplies the common UI primitives.
4. Each workstream builds against those contracts, with database changes coordinated through Sameer.
5. Run `npm run check` before handing off a branch. Do not commit generated builds, local credentials, or screenshots containing secrets.

Vercel can use its standard Next.js preset and the repository root. Add the public environment values when backend features are enabled. Deployment, Supabase provisioning, and GitHub branch creation are not performed by this scaffold.

## References

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase Next.js SSR setup](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Supabase local development](https://supabase.com/docs/guides/local-development)
