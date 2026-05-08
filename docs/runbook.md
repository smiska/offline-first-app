# Runbook

## Local Development

Install dependencies:
```bash
pnpm install
```

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

## Troubleshooting

- If installs are slow, pnpm may warn about registry request latency; re-run `pnpm install`.
- If Next.js fails to start, confirm your Node version and check `.env` variables.
