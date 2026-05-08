import { NextResponse } from "next/server";
import { pool } from "../../lib/db";
import type { IntegrationJobRow } from "../../lib/types";

export async function GET() {
  try {
    const result = await pool.query<IntegrationJobRow>(
      "SELECT * FROM integration_jobs ORDER BY created_at DESC LIMIT 50"
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to load integration jobs", message }, { status: 500 });
  }
}
