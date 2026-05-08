import { pool } from "./db";

/**
 * Accepts events transactionally and enqueues ERP jobs.
 * This is the core Phase 5 architectural decision:
 * external ERP calls are async jobs, not inline sync work.
 */
export async function appendEvents(events: any[]) {
  const client = await pool.connect();
  const accepted: string[] = [];
  const conflicts: any[] = [];

  try {
    await client.query("BEGIN");

    for (const event of events) {
      const existing = await client.query("SELECT id FROM events WHERE id=$1", [event.id]);
      if (existing.rowCount) {
        accepted.push(event.id);
        continue;
      }

      const versionResult = await client.query(
        "SELECT version FROM aggregate_versions WHERE aggregate_id=$1 FOR UPDATE",
        [event.aggregateId]
      );
      const serverVersion = versionResult.rowCount ? versionResult.rows[0].version : 0;

      if (event.baseVersion !== serverVersion) {
        conflicts.push({ eventId: event.id, aggregateId: event.aggregateId, serverVersion, clientBaseVersion: event.baseVersion });
        continue;
      }

      await client.query(
        `INSERT INTO events (id,type,aggregate_id,base_version,next_version,payload,client_timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [event.id, event.type, event.aggregateId, event.baseVersion, event.nextVersion, event.payload, event.timestamp]
      );

      await client.query(
        `INSERT INTO aggregate_versions (aggregate_id, version)
         VALUES ($1,$2)
         ON CONFLICT (aggregate_id) DO UPDATE SET version=EXCLUDED.version`,
        [event.aggregateId, event.nextVersion]
      );

      // Queue integration job in same DB transaction.
      await client.query(
        `INSERT INTO integration_jobs (event_id, payload)
         VALUES ($1,$2)`,
        [event.id, { eventId: event.id, type: event.type, aggregateId: event.aggregateId, data: event.payload }]
      );

      accepted.push(event.id);
    }

    await client.query("COMMIT");
    return { accepted, conflicts };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
