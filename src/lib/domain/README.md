# Shared domain contracts — Sameer

Define the shared validation schemas, operation inputs/results, versioning, currency/minor-unit representation, and lifecycle contracts before other workstreams add mutations. The agreed operations and invariants are in `plan.md`.

Keep privileged execution server-only. Financial and state-changing operations must be atomic and authorized in the database; components must not directly edit authoritative fields. This directory intentionally has no invented domain implementation.
