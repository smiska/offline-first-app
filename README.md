# Phase 5 – ERP Connector Layer

Adds:
- Postgres-backed integration queue
- retry
- exponential backoff
- DLQ/dead jobs
- worker process

Core idea:
`/api/sync` stores accepted domain events and enqueues ERP jobs in the same DB transaction.
ERP calls happen later in `npm run worker`.
You can run the same scripts with `pnpm run ...`.

Run:
```bash
docker compose up -d
pnpm install
pnpm run migrate
pnpm run dev
pnpm run worker
```
