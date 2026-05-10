"use client";
import { db, Event } from "./db";
import type { ProjectedJob } from "../lib/types";

function project(events: Event[]) {
  const jobs = new Map<string, ProjectedJob>();
  for (const e of events) {
    if (e.type === "JOB_CREATED") {
      const name =
        typeof e.payload === "object" &&
        e.payload !== null &&
        "name" in e.payload &&
        typeof (e.payload as { name: unknown }).name === "string"
          ? (e.payload as { name: string }).name
          : "Unnamed job";
      jobs.set(e.aggregateId, { id: e.aggregateId, name, status: "open", version: e.nextVersion });
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
  const nowIso = new Date().toISOString();
  await db.events.add({
    id: crypto.randomUUID(),
    type: "JOB_CREATED",
    aggregateId: id,
    baseVersion: 0,
    nextVersion: 1,
    payload: { name },
    timestamp: Date.now(),
    synced: false,
    localStatus: "queued",
    pushAttempts: 0,
    nextPushAt: nowIso,
    lastPushError: null
  });
}

export async function completeJob(job: Pick<ProjectedJob, "id" | "version">) {
  const nowIso = new Date().toISOString();
  await db.events.add({
    id: crypto.randomUUID(),
    type: "JOB_COMPLETED",
    aggregateId: job.id,
    baseVersion: job.version,
    nextVersion: job.version + 1,
    payload: {},
    timestamp: Date.now(),
    synced: false,
    localStatus: "queued",
    pushAttempts: 0,
    nextPushAt: nowIso,
    lastPushError: null
  });
}
