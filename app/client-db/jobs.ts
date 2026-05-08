"use client";
import { db, Event } from "./db";

function project(events: Event[]) {
  const jobs = new Map<string, any>();
  for (const e of events) {
    if (e.type === "JOB_CREATED") {
      jobs.set(e.aggregateId, { id: e.aggregateId, name: e.payload.name, status: "open", version: e.nextVersion });
    }
    if (e.type === "JOB_COMPLETED") {
      const job = jobs.get(e.aggregateId);
      if (job) { job.status = "done"; job.version = e.nextVersion; }
    }
  }
  return [...jobs.values()];
}

export async function getJobs() {
  return project(await db.events.orderBy("timestamp").toArray());
}

export async function createJob(name: string) {
  const id = crypto.randomUUID();
  await db.events.add({
    id: crypto.randomUUID(),
    type: "JOB_CREATED",
    aggregateId: id,
    baseVersion: 0,
    nextVersion: 1,
    payload: { name },
    timestamp: Date.now(),
    synced: false
  });
}

export async function completeJob(job: any) {
  await db.events.add({
    id: crypto.randomUUID(),
    type: "JOB_COMPLETED",
    aggregateId: job.id,
    baseVersion: job.version,
    nextVersion: job.version + 1,
    payload: {},
    timestamp: Date.now(),
    synced: false
  });
}
