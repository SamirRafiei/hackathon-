# Development scripts

`generate-db-types.mjs` runs the installed Supabase CLI and replaces the database type placeholder only after successful generation. It defaults to a running local Supabase instance; pass `--project-id PROJECT_REF` for an authorized hosted project.

Future demo provisioning/reset scripts belong here. They must not contain committed credentials, target arbitrary projects, or become public application endpoints.
