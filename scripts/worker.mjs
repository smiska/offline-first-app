import pg from "pg";
import { pathToFileURL } from "node:url";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgres://erp:erp@localhost:5432/offline_erp"
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fakeERP(payload) {
  // Mock external ERP. It randomly fails so retry/DLQ becomes visible.
  await sleep(150);
  if (Math.random() < Number(process.env.ERP_FAILURE_RATE || 0.35)) {
    throw new Error("ERP_TEMPORARY_FAILURE");
  }
  return { externalId: `ERP-${payload.eventId}` };
}

/**
 * Retry delay grows exponentially and is capped to 60 seconds.
 * Keeping this deterministic makes the worker policy easy to reason about and test.
 */
export function backoff(attempts) {
  return Math.min(60, Math.pow(2, attempts));
}

/**
 * A job turns dead when the current claim has already reached max attempts.
 * `attempts` is incremented as part of claim, so this check uses the claimed row.
 */
export function shouldMarkDead(job) {
  return job.attempts >= job.max_attempts;
}

export async function claimJob(client) {
  const result = await client.query(`
    UPDATE integration_jobs
    SET status='processing', attempts=attempts+1, updated_at=now()
    WHERE id = (
      SELECT id FROM integration_jobs
      WHERE status='pending' AND next_attempt_at <= now()
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `);
  return result.rows[0];
}

/**
 * Claims a single pending job and handles success/retry/dead transitions.
 * Claiming is done in a short transaction; ERP processing is intentionally outside it.
 */
export async function processOne() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const job = await claimJob(client);
    await client.query("COMMIT");
    if (!job) return false;

    try {
      await fakeERP(job.payload);
      await pool.query(
        "UPDATE integration_jobs SET status='succeeded', last_error=NULL, updated_at=now() WHERE id=$1",
        [job.id]
      );
      console.log("succeeded", job.id);
    } catch (e) {
      const dead = shouldMarkDead(job);
      await pool.query(
        `UPDATE integration_jobs
         SET status=$1, last_error=$2,
             next_attempt_at=now()+($3 || ' seconds')::interval,
             updated_at=now()
         WHERE id=$4`,
        [dead ? "dead" : "pending", e.message, backoff(job.attempts), job.id]
      );
      console.log("failed", job.id, dead ? "dead" : "retry");
    }
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function startWorker() {
  console.log("ERP worker started");
  while (true) {
    const didWork = await processOne();
    await sleep(didWork ? 300 : 1500);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await startWorker();
}
