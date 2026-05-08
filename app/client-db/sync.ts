"use client";
import { db } from "./db";
import type { SyncResult } from "../lib/types";

export async function sync(): Promise<SyncResult> {
  const events = await db.events.filter((event) => !event.synced).toArray();
  if (!events.length) return { accepted: [], conflicts: [] };

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sync failed: ${response.status} ${text}`);
  }

  const result = (await response.json()) as SyncResult;

  for (const id of result.accepted) {
    await db.events.update(id, { synced: true });
  }

  return result;
}
