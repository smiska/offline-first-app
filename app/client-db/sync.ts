"use client";
import { db } from "./db";

export async function sync() {
  const events = await db.events.where("synced").equals(0).toArray();
  if (!events.length) return { accepted: [], conflicts: [] };

  const result = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events })
  }).then(r => r.json());

  for (const id of result.accepted) {
    await db.events.update(id, { synced: true });
  }

  return result;
}
