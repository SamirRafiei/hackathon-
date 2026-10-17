# Reserved routes

The landing page `/` is the browser-local walkthrough. The first authenticated agreement slice is available separately through the account workspace routes.

- `/login`, `/signup`, and `/auth/callback`: Supabase email/password sign-in and verification callback.
- `/agreements/new`, `/invite/[token]`, and `/agreements/[id]`: persistent authenticated create, claim, review, and acceptance flow.
- Reserved follow-up routes: `dashboard`, `activity`, `agreements/[id]/funding`.
- Tayma AlDabbas: `agreements/[id]/handover`, `agreements/[id]/return`.
- Aiperi: `agreements/[id]/dispute`, `review`, `review/[caseId]`.
- `api/`: future Route Handlers where needed, coordinated with the domain owner.

Implement pages in these folders using the corresponding `src/features/` module. Each feature has reserved `components/`, `schemas/`, and `server/` folders. Use `server-only` in privileged modules; do not import server code into Client Components. Keep per-operation authorization in mutations even when page-level protection is added.
