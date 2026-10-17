# Database workspace — Sameer

Schema v1, integrity triggers, RLS and private Storage policies are implemented in
ordered [migrations](./migrations/). Read [SCHEMA.md](./SCHEMA.md) for the entity map,
permissions, defaults, migration commands and verification limits. Read
[OPERATIONS.md](./OPERATIONS.md) for the contract handoff and required atomic RPCs.

`config.toml` remains local Supabase configuration. `seed.sql` remains free of
product data and credentials. No hosted project has been provisioned, linked or
modified. No financial engine, mutation RPC or scheduler job is enabled yet.

Run `npm test` or `npm run test:db` for executable embedded PostgreSQL verification
without Docker. With the actual local Supabase stack running, apply migrations and
run `npm run db:types`. The generated types file remains unchanged until the official
generator succeeds against a real Supabase database.
