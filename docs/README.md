# Offline ERP Phase 5 - ERP Connector

This folder is a starting point for project documentation.

## Quickstart

Prereqs:
- Node.js (tested with v24.x)
- pnpm

Install:
```bash
pnpm install
```

Run (development UI):
```bash
pnpm dev
```

Other scripts:
```bash
pnpm run migrate
pnpm run worker
```

## What This Project Does (High-Level)

This repository is a small Next.js app plus Node scripts that appear to:
- Run a web UI (Next.js) for offline-capable data handling (Dexie / IndexedDB).
- Talk to a PostgreSQL database (`pg`) for server-side persistence and/or sync.
- Provide a migration entrypoint (`scripts/migrate.mjs`) for DB schema changes.
- Provide a worker entrypoint (`scripts/worker.mjs`) for background sync / jobs.

See:
- `docs/architecture.md` for an overview and diagram.
- `docs/runbook.md` for day-to-day operational notes.
