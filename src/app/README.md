# Reserved routes

Only `/` has a page. The other route folders contain `.gitkeep` files so Git preserves the team's workspace; they do not expose working screens.

- Valera: `(auth)/login`, `(auth)/signup`, `invite/[token]`, `agreements/new`.
- Hayk: `dashboard`, `activity`, `agreements/[id]`, `agreements/[id]/funding`.
- Tayma AlDabbas: `agreements/[id]/handover`, `agreements/[id]/return`.
- Aiperi: `agreements/[id]/dispute`, `review`, `review/[caseId]`.
- `api/`: future Route Handlers where needed, coordinated with the domain owner.

Implement pages in these folders using the corresponding `src/features/` module. Each feature has reserved `components/`, `schemas/`, and `server/` folders. Use `server-only` in privileged modules; do not import server code into Client Components. Keep per-operation authorization in mutations even when page-level protection is added.
