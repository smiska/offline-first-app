"use client";

import { db } from "./db";
import type {
  EventConflict,
  EventInput,
  EventLocalStatus,
  SyncConflict,
  SyncResult
} from "../lib/types";
import { getApiBaseUrl, toApiUrl } from "../lib/clientApi";

export function isLocalConnectorMode(): boolean {
  return process.env.NEXT_PUBLIC_LOCAL_CONNECTOR_MODE === "1";
}

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

function normalizeLocalStatus(status: EventLocalStatus | undefined): EventLocalStatus {
  return status ?? "queued";
}

function computeNextPushAt(nowMs: number, nextAttempts: number): string {
  const exp = Math.max(0, nextAttempts - 1);
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** exp, MAX_BACKOFF_MS);
  return new Date(nowMs + delay).toISOString();
}

export type OutboxSummary = {
  total: number;
  queued: number;
  pushing: number;
  pushed: number;
  conflict: number;
  error: number;
  nextDueAt: string | null;
};

export async function getOutboxEvents(): Promise<EventInput[]> {
  const events = await db.events.orderBy("timestamp").toArray();
  return events
    .filter((event) => !event.synced)
    .map((event) => ({
      ...event,
      localStatus: normalizeLocalStatus(event.localStatus),
      pushAttempts: event.pushAttempts ?? 0,
      nextPushAt: event.nextPushAt ?? new Date().toISOString(),
      lastPushError: event.lastPushError ?? null
    }))
    .sort((a, b) => (a.nextPushAt ?? "").localeCompare(b.nextPushAt ?? ""));
}

export async function getOutboxSummary(): Promise<OutboxSummary> {
  const events = await getOutboxEvents();
  const summary: OutboxSummary = {
    total: events.length,
    queued: 0,
    pushing: 0,
    pushed: 0,
    conflict: 0,
    error: 0,
    nextDueAt: null
  };

  const nowIso = new Date().toISOString();
  for (const event of events) {
    summary[normalizeLocalStatus(event.localStatus)]++;
    if (event.localStatus === "queued" || event.localStatus === "error") {
      const dueAt = event.nextPushAt ?? nowIso;
      if (dueAt <= nowIso && (summary.nextDueAt === null || dueAt < summary.nextDueAt)) {
        summary.nextDueAt = dueAt;
      }
    }
  }

  return summary;
}

async function ensureLocalEnqueue(): Promise<void> {
  const nowIso = new Date().toISOString();
  const unsynced = await db.events.filter((event) => !event.synced).toArray();

  for (const event of unsynced) {
    const status = normalizeLocalStatus(event.localStatus);
    if (status === "conflict" || status === "pushed") {
      continue;
    }

    const changes: Partial<EventInput> = {};
    if (!event.localStatus) changes.localStatus = "queued";
    if (event.pushAttempts === undefined) changes.pushAttempts = 0;
    if (!event.nextPushAt) changes.nextPushAt = nowIso;
    if (event.lastPushError === undefined) changes.lastPushError = null;
    if (Object.keys(changes).length) {
      await db.events.update(event.id, changes);
    }
  }
}

async function markPushFailure(events: EventInput[], errorMessage: string): Promise<void> {
  const nowMs = Date.now();
  for (const event of events) {
    const currentAttempts = event.pushAttempts ?? 0;
    const nextAttempts = currentAttempts + 1;
    await db.events.update(event.id, {
      localStatus: "error",
      pushAttempts: nextAttempts,
      nextPushAt: computeNextPushAt(nowMs, nextAttempts),
      lastPushError: errorMessage
    });
  }
}

async function applyServerResult(result: SyncResult): Promise<void> {
  const acceptedSet = new Set(result.accepted);
  const conflictById = new Map<string, EventConflict>();
  for (const conflict of result.conflicts) {
    conflictById.set(conflict.eventId, {
      serverVersion: conflict.serverVersion,
      clientBaseVersion: conflict.clientBaseVersion
    });
  }

  const touched = [...acceptedSet.keys(), ...conflictById.keys()];
  for (const id of touched) {
    if (acceptedSet.has(id)) {
      await db.events.update(id, {
        synced: true,
        localStatus: "pushed",
        lastPushError: null,
        conflict: undefined
      });
    } else {
      await db.events.update(id, {
        synced: false,
        localStatus: "conflict",
        lastPushError: null,
        conflict: conflictById.get(id)
      });
    }
  }
}

async function attemptPushEligible(): Promise<SyncResult> {
  const nowIso = new Date().toISOString();
  const due = await db.events
    .filter((event) => {
      if (event.synced) return false;
      const status = normalizeLocalStatus(event.localStatus);
      if (status !== "queued" && status !== "error") return false;
      const next = event.nextPushAt ?? nowIso;
      return next <= nowIso;
    })
    .toArray();

  if (!due.length) {
    return { accepted: [], conflicts: [] };
  }

  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    await markPushFailure(due, "No NEXT_PUBLIC_API_BASE_URL configured for remote sync.");
    return { accepted: [], conflicts: [] };
  }

  for (const event of due) {
    await db.events.update(event.id, { localStatus: "pushing" });
  }

  try {
    const response = await fetch(toApiUrl("/api/sync"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: due })
    });

    if (!response.ok) {
      const text = await response.text();
      await markPushFailure(due, `Sync failed: ${response.status} ${text}`);
      return { accepted: [], conflicts: [] };
    }

    const result = (await response.json()) as SyncResult;
    await applyServerResult(result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    await markPushFailure(due, message);
    return { accepted: [], conflicts: [] };
  }
}

export async function syncOfflineFirst(): Promise<SyncResult> {
  await ensureLocalEnqueue();
  return attemptPushEligible();
}

export async function retryPushDlq(): Promise<{ ok: true; reset: number }> {
  const nowIso = new Date().toISOString();
  const failed = await db.events.filter((event) => !event.synced && normalizeLocalStatus(event.localStatus) === "error").toArray();
  let reset = 0;
  for (const event of failed) {
    await db.events.update(event.id, {
      localStatus: "queued",
      pushAttempts: 0,
      nextPushAt: nowIso,
      lastPushError: null
    });
    reset++;
  }
  return { ok: true, reset };
}
