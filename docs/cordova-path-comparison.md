# Cordova Path Comparison (Light POCs)

This document compares the two exploration branches and recommends a production direction.

## Explored Branches

- `spike/cordova-remote-backend` (`a2bccb1`)
- `spike/cordova-local-replacement` (`fa15b78`)

## What Was Implemented

### Path A: Remote Backend

- Added client API URL adapter for mobile-friendly base URL selection.
- Updated frontend calls to use configurable API URLs.
- Added unit tests for URL adapter behavior.
- Added Cordova Android POC notes under `mobile/cordova/`.

### Path B: Local Replacement

- Added feature-flagged local connector mode (`NEXT_PUBLIC_LOCAL_CONNECTOR_MODE=1`).
- Added local queue table and local sync/queue replacement logic in Dexie.
- Updated UI + sync flow to branch between local and server-backed modes.
- Added unit tests to verify local-mode branching while preserving default behavior.

## Comparison

| Criterion | Path A: Remote Backend | Path B: Local Replacement |
|---|---|---|
| Behavior parity with current app | High | Medium (POC only, partial server replacement) |
| Architecture change size | Small | Large |
| Operational complexity | Moderate (deploy backend + mobile networking) | High (new local semantics, drift risk) |
| Security/compliance surface | Standard API + CORS/TLS concerns | Broader local data and logic responsibility |
| Effort to production | Lower | Much higher |
| Strategic flexibility | Good for near-term delivery | Good for longer-term full local strategy |

## Key Issues to Consider

1. Next.js `/api/*` route handlers do not run in Cordova WebView; they must stay remote or be replaced.
2. Mobile app networking requires backend CORS, HTTPS policy, and stable environment configuration.
3. Local replacement introduces behavior drift risk unless queue/worker/idempotency semantics are fully reimplemented.
4. Testing for Path B needs significantly more integration coverage to match current server guarantees.

## Recommendation (Updated)

Given the requirement that a remote backend is **not reliably available**, Path A alone is insufficient.

Adopt **Path B as the primary direction**: an offline-first outbox model where events are durably stored locally and server availability is opportunistic.

Still keep the **Path A transport helper** (`NEXT_PUBLIC_API_BASE_URL` + `toApiUrl()`) so that when a backend is reachable, the client can push outbox events and obtain server ACK/conflict decisions.

Key semantics:
- `synced=true` means "server-acked" and must only be set after a successful server response.
- local outbox status (queued/error/conflict/etc.) drives retry/backoff and UI visibility.

## Suggested Next Steps

1. Implement outbox state (`localStatus`, `pushAttempts`, `nextPushAt`, `lastPushError`, conflict payload) and persist it in Dexie.
2. Implement opportunistic push to server using `toApiUrl("/api/sync")`, with exponential backoff on failures.
3. Wire "Retry DLQ" to reset local push failures (do not call server retry in local mode).
4. Update UI to show outbox summary + conflicts in local mode, and ERP queue in remote mode.
