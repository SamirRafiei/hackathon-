# Pact

Make a pact. Keep it fair.

Pact is a prototype for making rental deposits easier to understand and settle fairly. The current demo follows one apartment deposit from shared terms through simulated funding, return review, and an agreed split. The broader product plan is in [plan.md](./plan.md).

The idea can fit inside a banking app or another trusted host experience. This standalone prototype has no banking-provider integration and does not hold, move, or protect real money.

The repository also contains a backend foundation from `feat/core-ledger`: validated domain contracts, PostgreSQL migrations, access/storage policies, and simulated funding/cancellation operations. These are not connected to the interactive demo yet.

## Start locally

Use Node.js 22.12+ on the 22.x line, or a supported even-numbered LTS release (24+), with npm. Use the committed `package-lock.json`; do not introduce another package manager's lockfile.

```sh
npm ci
```

```sh
npm run dev
```

Open http://localhost:3000. The demo works without Docker, Supabase credentials, or an account. Use the landlord/tenant switcher to walk through the same seeded agreement. Demo choices and activity are saved in that browser's local storage, so two different browsers do not share data.

This identity switch is a demo control, not sign-in or proof of identity. Anyone can switch between the fake parties. Do not use real personal information or money. Future host-app integration must verify a signed identity assertion on the server; a browser-provided name, role, or biometric claim is not sufficient. The Supabase factories and database operations remain unused by this demo. Migrations are not applied to a local or hosted database, and server authorization/route wiring remains future work.

## Project structure

```text
src/
  app/                 App Router entry, global styles, reserved route folders
  components/ui/       Shared accessible UI components
  features/
    demo/               Seeded agreement, local demo repository, interactive workflow
    agreements/        Reserved for future creation, revisions, invitations, acceptance
    deposits/          Reserved for future provider, persistent funding, transaction history
    handover/          Condition evidence, QR/code, collection, return
    disputes/          Claims, negotiation, reviewer workspace
  lib/
    auth/              Identity-provider boundary; current fake demo identities
    domain/            Shared validation, agreement contracts, allocation and provider boundary
    supabase/          Browser and server client factories
    env.ts             Lazy public Supabase environment validation
    utils.ts           Tailwind-aware class name helper
  types/database.ts    Empty generated-schema placeholder
supabase/              Local configuration, ordered schema/access/operation migrations and docs
scripts/               Database type-generation utility
tests/unit/            Demo, domain, simulated provider and embedded PostgreSQL tests
tests/e2e/             Future Playwright transaction journeys
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

Vitest covers the simulated agreement lifecycle, domain rules and local-storage repository. `npm run test:db` applies the migrations in embedded PGlite and checks database constraints/policies. PGlite is useful for SQL regression checks but does not establish hosted Supabase behavior, true concurrent transaction safety, server authorization, or real money movement. Playwright is configured, but there are no browser journeys yet. Before running the first browser test, install Chromium with `npx playwright install chromium` (on Linux CI use `--with-deps`). GitHub Actions currently runs `npm run check`, not browser tests.

## Supabase workflow

`supabase/config.toml` is local development configuration, not a hosted deployment. Docker is optional for frontend work and required only for running the local Supabase stack.

```sh
# Local database development (Docker running)
npm run db:start
npm run db:status
npm run db:types
```

For an existing hosted project, authenticate with `npx supabase login` and generate types using the project reference command above. The project ID flag is explicit; the script does not load `.env.local`. Review and apply migrations only to a project you are authorized to change.

The migrations define agreement/version, acceptance, evidence, dispute, ledger and audit tables, integrity constraints, participant access, private evidence storage, simulated funding and pre-handover cancellation/refund operations. They have not been applied to a Supabase instance, and the browser demo does not call them. Host identity verification, authenticated route/RPC wiring for the full workflow, scheduled deadline processing, hosted reviewer setup, and generated database types remain incomplete. `src/types/database.ts` is still a placeholder. The current agreement remains a local fixture and is not shared between browsers. Use Docker only if you choose to run the local Supabase stack; the app and embedded database tests do not need Docker.

## Next implementation steps

1. Keep the current demo provider and local repository restricted to fake data.
2. Complete authorized server operations and host-identity verification before using real accounts.
3. Apply the migrations to a disposable Supabase project, review behavior, and generate database types.
4. Implement the missing agreement lifecycle operations and connect the UI through server routes.
5. Add hosted/concurrent access and deadline-worker checks before connecting real users or money.
6. Do not commit local credentials or screenshots containing secrets.

Vercel can use its standard Next.js preset and the repository root. Add the public environment values when backend features are enabled. Deployment, Supabase provisioning, and GitHub branch creation are not performed by this scaffold.

## References

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase Next.js SSR setup](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Supabase local development](https://supabase.com/docs/guides/local-development)
