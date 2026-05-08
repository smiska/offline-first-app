import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

export async function POST() {
  await pool.query(
    `UPDATE integration_jobs
     SET status='pending', attempts=0, next_attempt_at=now(), last_error=NULL
     WHERE status='dead'`
  );
  return NextResponse.json({ ok: true });
}
