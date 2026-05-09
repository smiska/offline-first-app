# Runbook

## Local Development

Install dependencies:
```bash
pnpm install
```

If you prefer npm, equivalent commands work with `npm run <script>`.

Start Next.js dev server:
```bash
pnpm dev
```

## Database

Bring up Postgres (if `docker-compose.yml` includes it):
```bash
docker compose up -d
```

Run migrations:
```bash
pnpm run migrate
```

Start background worker:
```bash
pnpm run worker
```

## Environment Variables

- `DATABASE_URL`: Postgres connection string (default: `postgres://erp:erp@localhost:5432/offline_erp`)
- `ERP_FAILURE_RATE`: mock ERP failure ratio used by the worker (default: `0.35`)

## Troubleshooting

- If installs are slow, pnpm may warn about registry request latency; re-run `pnpm install`.
- If Next.js fails to start, confirm your Node version and check `.env` variables.
