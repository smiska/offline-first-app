CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  next_version INTEGER NOT NULL,
  payload JSONB NOT NULL,
  client_timestamp BIGINT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aggregate_versions (
  aggregate_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  connector TEXT NOT NULL DEFAULT 'mock-erp',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_jobs_pending
ON integration_jobs(status, next_attempt_at);
