# Database workspace

`config.toml` configures local Supabase only. The initial migration defines the participant-scoped agreement and simulated-ledger schema with read-only browser access. It is a persistence foundation, not a complete backend: authenticated transactional operations must be implemented before connecting the app to these tables. `seed.sql` is intentionally empty of product data.

The migration has not been applied to a local or hosted database. Start locally with Docker and `npm run db:start`, then review and apply it before generating `src/types/database.ts`. No hosted project has been provisioned, linked, or changed.

Evidence storage policies, transactional mutation functions, reviewer grants, and deadline jobs still need implementation. Do not assume generated local defaults enforce Pact's participant or reviewer permissions.
