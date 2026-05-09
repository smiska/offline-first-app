import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { applySchema, closePool as closeHelperPool, resetTables } from "../helpers/db";
import { buildEvent } from "../helpers/events";

let postSync: (req: Request) => Promise<Response>;
let getJobsRoute: () => Promise<Response>;
let retryRoute: () => Promise<Response>;
let processOne: () => Promise<boolean>;
let appPool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number }>; end: () => Promise<void> };

describe("integration pipeline", () => {
  beforeAll(async () => {
    process.env.ERP_FAILURE_RATE = "0";
    await applySchema();

    const syncModule = await import("../../app/api/sync/route");
    const jobsModule = await import("../../app/api/integration-jobs/route");
    const retryModule = await import("../../app/api/integration-jobs/retry/route");
    const workerModule = await import("../../scripts/worker.mjs");
    const dbModule = await import("../../app/lib/db");

    postSync = syncModule.POST;
    getJobsRoute = jobsModule.GET;
    retryRoute = retryModule.POST;
    processOne = workerModule.processOne;
    appPool = dbModule.pool;
  });

  beforeEach(async () => {
    await resetTables();
    process.env.ERP_FAILURE_RATE = "0";
  });

  afterAll(async () => {
    await appPool.end();
    await closeHelperPool();
  });

  it("runs happy path from sync ingestion to worker success", async () => {
    const event = buildEvent({ id: "11111111-1111-4111-8111-111111111111", aggregateId: "job-happy" });
    const request = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [event] })
    });

    const syncResponse = await postSync(request);
    expect(syncResponse.status).toBe(200);
    await expect(syncResponse.json()).resolves.toEqual({ accepted: ["11111111-1111-4111-8111-111111111111"], conflicts: [] });

    const pendingBefore = await appPool.query("SELECT status FROM integration_jobs WHERE event_id=$1", ["11111111-1111-4111-8111-111111111111"]);
    expect(pendingBefore.rows[0].status).toBe("pending");

    const didWork = await processOne();
    expect(didWork).toBe(true);

    const after = await appPool.query("SELECT status,last_error FROM integration_jobs WHERE event_id=$1", ["11111111-1111-4111-8111-111111111111"]);
    expect(after.rows[0]).toEqual({ status: "succeeded", last_error: null });
  });

  it("returns conflict on stale baseVersion without enqueueing extra job", async () => {
    const first = buildEvent({ id: "22222222-2222-4222-8222-222222222221", aggregateId: "job-conflict", baseVersion: 0, nextVersion: 1 });
    const stale = buildEvent({ id: "22222222-2222-4222-8222-222222222222", aggregateId: "job-conflict", type: "JOB_COMPLETED", baseVersion: 0, nextVersion: 1 });

    await postSync(
      new Request("http://localhost/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: [first] })
      })
    );

    const conflictResponse = await postSync(
      new Request("http://localhost/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: [stale] })
      })
    );
    const conflictBody = await conflictResponse.json();

    expect(conflictBody.accepted).toEqual([]);
    expect(conflictBody.conflicts).toHaveLength(1);

    const jobCount = await appPool.query("SELECT COUNT(*)::int AS count FROM integration_jobs");
    expect(jobCount.rows[0].count).toBe(1);
  });

  it("keeps replay idempotent when the same event id is sent twice", async () => {
    const event = buildEvent({ id: "33333333-3333-4333-8333-333333333333", aggregateId: "job-idem" });

    await postSync(
      new Request("http://localhost/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: [event] })
      })
    );
    const replayResponse = await postSync(
      new Request("http://localhost/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: [event] })
      })
    );

    await expect(replayResponse.json()).resolves.toEqual({ accepted: ["33333333-3333-4333-8333-333333333333"], conflicts: [] });
    const eventCount = await appPool.query("SELECT COUNT(*)::int AS count FROM events WHERE id=$1", ["33333333-3333-4333-8333-333333333333"]);
    const jobCount = await appPool.query("SELECT COUNT(*)::int AS count FROM integration_jobs WHERE event_id=$1", ["33333333-3333-4333-8333-333333333333"]);
    expect(eventCount.rows[0].count).toBe(1);
    expect(jobCount.rows[0].count).toBe(1);
  });

  it("moves failed jobs to dead and allows retry route to reactivate", async () => {
    process.env.ERP_FAILURE_RATE = "1";
    const event = buildEvent({ id: "44444444-4444-4444-8444-444444444444", aggregateId: "job-dead" });

    await postSync(
      new Request("http://localhost/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: [event] })
      })
    );

    for (let i = 0; i < 5; i += 1) {
      await processOne();
      await appPool.query("UPDATE integration_jobs SET next_attempt_at=now() WHERE event_id=$1 AND status='pending'", ["44444444-4444-4444-8444-444444444444"]);
    }

    const deadRow = await appPool.query(
      "SELECT status, attempts, max_attempts, last_error FROM integration_jobs WHERE event_id=$1",
      ["44444444-4444-4444-8444-444444444444"]
    );
    expect(deadRow.rows[0].status).toBe("dead");
    expect(deadRow.rows[0].attempts).toBe(deadRow.rows[0].max_attempts);
    expect(deadRow.rows[0].last_error).toBe("ERP_TEMPORARY_FAILURE");

    const retryResponse = await retryRoute();
    await expect(retryResponse.json()).resolves.toEqual({ ok: true });

    const retried = await appPool.query(
      "SELECT status, attempts, last_error FROM integration_jobs WHERE event_id=$1",
      ["44444444-4444-4444-8444-444444444444"]
    );
    expect(retried.rows[0]).toEqual({ status: "pending", attempts: 0, last_error: null });
  });

  it("returns jobs list contract from integration jobs endpoint", async () => {
    await postSync(
      new Request("http://localhost/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: [buildEvent({ id: "55555555-5555-4555-8555-555555555555", aggregateId: "job-list" })] })
      })
    );

    const response = await getJobsRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({
      event_id: "55555555-5555-4555-8555-555555555555",
      status: "pending"
    });
  });
});
