# Database workspace — Sameer

`config.toml` configures local Supabase only. `migrations/` is reserved for ordered schema, constraints, RLS, controlled functions, and scheduler changes. `seed.sql` is intentionally empty of product data.

No hosted project has been provisioned, linked, or changed. Start locally with Docker and `npm run db:start`, or coordinate an authorized hosted project with the team. Define the real schema before generating `src/types/database.ts`.

All app tables, storage policies, grants, and cron jobs still need implementation. Do not assume generated local defaults enforce Pact's participant or reviewer permissions.
