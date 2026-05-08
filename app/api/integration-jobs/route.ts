import { NextResponse } from "next/server";
import { pool } from "../../lib/db";

export async function GET() {
  const result = await pool.query(
    "SELECT * FROM integration_jobs ORDER BY created_at DESC LIMIT 50"
  );
  return NextResponse.json(result.rows);
}
