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

Run:
```bash
docker compose up -d
npm install
npm run migrate
npm run dev
npm run worker
```
